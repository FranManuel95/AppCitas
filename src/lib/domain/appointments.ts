import { prisma } from "@/lib/prisma";
import {
  chooseStaffId,
  computeDaySlots,
  computeStaffDaySlots,
  isOfferedSlot,
  type SlotEngineInput,
  type StaffAgendaContext,
  type StaffSlot,
} from "./availability";
import { evaluateCancellation } from "./cancellation";
import { DomainError } from "./errors";
import {
  addDaysISO,
  isValidDateISO,
  toLocalDateISO,
  wallTimeToUtc,
} from "./dates";
import { BLOCKING_STATUSES, type AppointmentStatus } from "./types";
import { collectAppointmentCharge } from "@/lib/payments/collect";
import {
  enqueueBookingNotifications,
  enqueueCancellationNotifications,
} from "@/lib/notifications/service";

interface AvailabilityContext {
  business: {
    id: string;
    timezone: string;
    slotGranularityMinutes: number;
    minNoticeMinutes: number;
    maxAdvanceBookingDays: number;
    hours: Array<{ weekday: number; openTime: string; closeTime: string }>;
    closedDates: string[];
  };
  service: { id: string; durationMinutes: number; priceCents: number };
  // Empleados activos cualificados para el servicio (vacío = negocio sin equipo)
  staff: StaffAgendaContext[];
  // Carga del día por empleado (para asignación automática)
  dayLoadByStaff: Map<string, number>;
  engineBase: Omit<SlotEngineInput, "busy" | "hours">;
  // Solo para negocios sin equipo: ocupación a nivel de negocio
  businessBusy: Array<{ startAt: Date; endAt: Date }>;
}

async function loadAvailabilityContext(params: {
  businessId: string;
  serviceId: string;
  dateISO: string;
  now: Date;
  staffId?: string;
}): Promise<AvailabilityContext> {
  const { businessId, serviceId, dateISO, now, staffId } = params;

  if (!isValidDateISO(dateISO)) {
    throw new DomainError("Fecha no válida", "INVALID_DATE");
  }

  const [business, service] = await Promise.all([
    prisma.business.findFirst({
      where: { id: businessId, active: true },
      include: { hours: true, closures: { where: { date: dateISO } } },
    }),
    prisma.service.findFirst({
      where: { id: serviceId, businessId, active: true },
    }),
  ]);

  if (!business) throw new DomainError("Negocio no encontrado", "BUSINESS_NOT_FOUND", 404);
  if (!service) throw new DomainError("Servicio no encontrado", "SERVICE_NOT_FOUND", 404);

  // Empleados activos que realizan este servicio (sin filas de servicios
  // asignados = los realiza todos)
  const staffMembers = await prisma.staffMember.findMany({
    where: {
      businessId,
      active: true,
      ...(staffId ? { id: staffId } : {}),
      OR: [{ services: { none: {} } }, { services: { some: { serviceId } } }],
    },
    include: { hours: true },
  });

  if (staffId && staffMembers.length === 0) {
    throw new DomainError(
      "Ese profesional no está disponible para este servicio",
      "STAFF_NOT_AVAILABLE",
      404,
    );
  }

  // Intervalo UTC que cubre el día local del negocio
  const dayStart = wallTimeToUtc(dateISO, "00:00", business.timezone);
  const dayEnd = wallTimeToUtc(addDaysISO(dateISO, 1), "00:00", business.timezone);

  const dayAppointments = await prisma.appointment.findMany({
    where: {
      businessId,
      status: { in: [...BLOCKING_STATUSES] },
      startAt: { lt: dayEnd },
      endAt: { gt: dayStart },
    },
    select: { startAt: true, endAt: true, staffId: true },
  });

  const dayLoadByStaff = new Map<string, number>();
  for (const a of dayAppointments) {
    if (a.staffId) {
      dayLoadByStaff.set(a.staffId, (dayLoadByStaff.get(a.staffId) ?? 0) + 1);
    }
  }

  // Las citas sin empleado (creadas cuando el negocio no tenía equipo, o de
  // sala única) bloquean la agenda de todos los empleados.
  const unassignedBusy = dayAppointments.filter((a) => !a.staffId);

  return {
    business: {
      id: business.id,
      timezone: business.timezone,
      slotGranularityMinutes: business.slotGranularityMinutes,
      minNoticeMinutes: business.minNoticeMinutes,
      maxAdvanceBookingDays: business.maxAdvanceBookingDays,
      hours: business.hours,
      closedDates: business.closures.map((c) => c.date),
    },
    service: {
      id: service.id,
      durationMinutes: service.durationMinutes,
      priceCents: service.priceCents,
    },
    staff: staffMembers.map((m) => ({
      id: m.id,
      hours: m.hours,
      busy: [
        ...dayAppointments.filter((a) => a.staffId === m.id),
        ...unassignedBusy,
      ].map((a) => ({ startAt: a.startAt, endAt: a.endAt })),
    })),
    dayLoadByStaff,
    engineBase: {
      dateISO,
      timezone: business.timezone,
      closedDates: business.closures.map((c) => c.date),
      durationMinutes: service.durationMinutes,
      granularityMinutes: business.slotGranularityMinutes,
      minNoticeMinutes: business.minNoticeMinutes,
      maxAdvanceBookingDays: business.maxAdvanceBookingDays,
      now,
    },
    businessBusy: dayAppointments.map((a) => ({
      startAt: a.startAt,
      endAt: a.endAt,
    })),
  };
}

function slotsFromContext(ctx: AvailabilityContext): StaffSlot[] {
  if (ctx.staff.length > 0) {
    return computeStaffDaySlots(ctx.engineBase, ctx.business.hours, ctx.staff);
  }
  // Negocio sin equipo: agenda única (capacidad 1)
  return computeDaySlots({
    ...ctx.engineBase,
    hours: ctx.business.hours,
    busy: ctx.businessBusy,
  }).map((s) => ({ ...s, staffIds: [] }));
}

export async function getAvailability(params: {
  businessId: string;
  serviceId: string;
  dateISO: string;
  staffId?: string;
  now?: Date;
}): Promise<StaffSlot[]> {
  const ctx = await loadAvailabilityContext({
    ...params,
    now: params.now ?? new Date(),
  });
  return slotsFromContext(ctx);
}

export async function createAppointment(params: {
  businessId: string;
  serviceId: string;
  clientId: string;
  startAt: Date;
  staffId?: string;
  notes?: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const { businessId, serviceId, clientId, startAt, staffId, notes } = params;

  const businessRow = await prisma.business.findFirst({
    where: { id: businessId, active: true },
    select: { timezone: true },
  });
  if (!businessRow) {
    throw new DomainError("Negocio no encontrado", "BUSINESS_NOT_FOUND", 404);
  }

  const dateISO = toLocalDateISO(startAt, businessRow.timezone);
  const ctx = await loadAvailabilityContext({
    businessId,
    serviceId,
    dateISO,
    now,
    staffId,
  });

  // Solo se aceptan instantes exactamente ofertados por el motor de huecos:
  // valida horario, antelaciones, cierres y solapamientos.
  const slot = slotsFromContext(ctx).find(
    (s) => s.start.getTime() === startAt.getTime(),
  );
  if (!slot) {
    throw new DomainError(
      "El horario seleccionado ya no está disponible",
      "SLOT_UNAVAILABLE",
      409,
    );
  }

  // Con equipo: usa el empleado pedido o asigna el menos cargado del hueco
  const hasStaff = ctx.staff.length > 0;
  const assignedStaffId = hasStaff
    ? (staffId ?? chooseStaffId(slot.staffIds, ctx.dayLoadByStaff))
    : null;
  if (hasStaff && !assignedStaffId) {
    throw new DomainError(
      "No hay profesionales disponibles en ese horario",
      "SLOT_UNAVAILABLE",
      409,
    );
  }

  const endAt = new Date(
    startAt.getTime() + ctx.service.durationMinutes * 60_000,
  );

  // Transacción: re-comprueba el solapamiento justo antes de insertar para
  // cerrar la carrera entre dos reservas simultáneas del mismo hueco.
  const appointment = await prisma.$transaction(async (tx) => {
    const conflict = await tx.appointment.findFirst({
      where: {
        businessId,
        status: { in: [...BLOCKING_STATUSES] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        // Con empleado asignado solo chocan sus propias citas (o las de sala,
        // sin empleado); sin equipo choca cualquiera.
        ...(assignedStaffId
          ? { OR: [{ staffId: assignedStaffId }, { staffId: null }] }
          : {}),
      },
      select: { id: true },
    });
    if (conflict) {
      throw new DomainError(
        "Otro cliente acaba de reservar este hueco",
        "SLOT_TAKEN",
        409,
      );
    }

    return tx.appointment.create({
      data: {
        businessId,
        serviceId,
        clientId,
        staffId: assignedStaffId,
        startAt,
        endAt,
        status: "CONFIRMED",
        priceCents: ctx.service.priceCents,
        notes: notes?.trim() || null,
      },
      include: {
        service: true,
        business: true,
        staff: { select: { id: true, name: true, color: true } },
      },
    });
  });

  // Confirmación inmediata + recordatorio programado (outbox)
  await enqueueBookingNotifications(appointment.id, now);

  return appointment;
}

export async function cancelAppointment(params: {
  appointmentId: string;
  actorUserId: string;
  actorIsBusinessAdmin: boolean;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const { appointmentId, actorUserId, actorIsBusinessAdmin } = params;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { business: true, service: true },
  });
  if (!appointment) {
    throw new DomainError("Cita no encontrada", "APPOINTMENT_NOT_FOUND", 404);
  }

  const isOwnerOfAppointment = appointment.clientId === actorUserId;
  if (!isOwnerOfAppointment && !actorIsBusinessAdmin) {
    throw new DomainError("No tienes permiso sobre esta cita", "FORBIDDEN", 403);
  }

  if (appointment.status !== "CONFIRMED") {
    throw new DomainError(
      "Solo se pueden cancelar citas confirmadas",
      "INVALID_STATUS",
      409,
    );
  }
  if (appointment.startAt.getTime() <= now.getTime()) {
    throw new DomainError(
      "La cita ya ha comenzado; el negocio debe registrarla como completada o no presentada",
      "ALREADY_STARTED",
      409,
    );
  }

  // El negocio puede cancelar sin penalizar al cliente; la política de cargo
  // solo aplica cuando cancela el propio cliente.
  const outcome =
    actorIsBusinessAdmin && !isOwnerOfAppointment
      ? { status: "CANCELLED" as const, chargedCents: 0, late: false }
      : evaluateCancellation(
          appointment.startAt,
          now,
          {
            windowHours: appointment.business.cancellationWindowHours,
            feePercent: appointment.business.lateCancellationFeePercent,
          },
          appointment.priceCents,
        );

  // Cobro automático del cargo con la tarjeta guardada (si la hay)
  const collection = await collectAppointmentCharge({
    appointmentId,
    clientId: appointment.clientId,
    amountCents: outcome.chargedCents,
    currency: appointment.business.currency,
    description: `Cancelación tardía · ${appointment.service.name} · ${appointment.business.name}`,
  });

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: outcome.status,
      chargedCents: outcome.chargedCents,
      cancelledAt: now,
      paymentStatus: collection.paymentStatus,
      paymentRef: collection.paymentRef,
    },
    include: { service: true, business: true },
  });

  await enqueueCancellationNotifications(
    appointmentId,
    outcome.chargedCents,
    now,
  );

  return { appointment: updated, outcome, collection };
}

// Acciones del negocio sobre citas pasadas o en curso.
export async function setAppointmentStatus(params: {
  appointmentId: string;
  businessId: string;
  status: AppointmentStatus;
}) {
  const { appointmentId, businessId, status } = params;

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, businessId },
    include: { business: true, service: true },
  });
  if (!appointment) {
    throw new DomainError("Cita no encontrada", "APPOINTMENT_NOT_FOUND", 404);
  }

  let chargedCents = appointment.chargedCents;
  switch (status) {
    case "COMPLETED":
      // El servicio prestado se cobra en persona/TPV: solo se registra
      chargedCents = appointment.priceCents;
      break;
    case "NO_SHOW":
    case "CANCELLED_LATE":
      // Mismo cargo que una cancelación tardía
      chargedCents = Math.round(
        (appointment.priceCents *
          appointment.business.lateCancellationFeePercent) /
          100,
      );
      break;
    case "CONFIRMED":
    case "CANCELLED":
      chargedCents = 0;
      break;
  }

  // El no-show intenta cobrarse automáticamente con la tarjeta guardada
  let collection = {
    paymentStatus: appointment.paymentStatus,
    paymentRef: appointment.paymentRef,
  };
  if (status === "NO_SHOW" && appointment.paymentStatus === "NONE") {
    collection = await collectAppointmentCharge({
      appointmentId,
      clientId: appointment.clientId,
      amountCents: chargedCents,
      currency: appointment.business.currency,
      description: `No presentado · ${appointment.service.name} · ${appointment.business.name}`,
    });
  }
  if (status === "CONFIRMED") {
    // Revertir a confirmada limpia el resultado de cobro registrado
    collection = { paymentStatus: "NONE", paymentRef: null };
  }

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status,
      chargedCents,
      paymentStatus: collection.paymentStatus,
      paymentRef: collection.paymentRef,
      cancelledAt:
        status === "CANCELLED" || status === "CANCELLED_LATE"
          ? (appointment.cancelledAt ?? new Date())
          : null,
    },
    include: {
      service: true,
      client: { select: { id: true, name: true, email: true } },
    },
  });
}

// Confirmación de asistencia desde el enlace del recordatorio.
export async function confirmAttendance(token: string, now = new Date()) {
  const appointment = await prisma.appointment.findUnique({
    where: { confirmationToken: token },
    select: { id: true, status: true, startAt: true },
  });
  if (!appointment) {
    throw new DomainError("Enlace no válido", "TOKEN_NOT_FOUND", 404);
  }
  if (appointment.status !== "CONFIRMED") {
    throw new DomainError(
      "Esta cita ya no está activa",
      "INVALID_STATUS",
      409,
    );
  }
  if (appointment.startAt.getTime() <= now.getTime()) {
    throw new DomainError("La cita ya ha pasado", "ALREADY_STARTED", 409);
  }

  return prisma.appointment.update({
    where: { id: appointment.id },
    data: { attendanceConfirmedAt: now },
    select: { id: true, attendanceConfirmedAt: true },
  });
}
