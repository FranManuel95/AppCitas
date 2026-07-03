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
import { cancellationDeadline, evaluateCancellation } from "./cancellation";
import { DomainError } from "./errors";
import {
  addDaysISO,
  isValidDateISO,
  toLocalDateISO,
  wallTimeToUtc,
} from "./dates";
import { BLOCKING_STATUSES, type AppointmentStatus } from "./types";
import {
  couponDiscountCents,
  couponRejection,
  packageRejection,
} from "./promotions";
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
  // Al reprogramar: la propia cita no bloquea su hueco (queda libre al moverla)
  excludeAppointmentId?: string;
}): Promise<AvailabilityContext> {
  const { businessId, serviceId, dateISO, now, staffId, excludeAppointmentId } =
    params;

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
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
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
  couponCode?: string;
  clientPackageId?: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const {
    businessId,
    serviceId,
    clientId,
    startAt,
    staffId,
    notes,
    couponCode,
    clientPackageId,
  } = params;

  if (couponCode && clientPackageId) {
    throw new DomainError(
      "No se puede combinar un cupón con un bono",
      "PROMO_CONFLICT",
    );
  }

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
  // cerrar la carrera entre dos reservas simultáneas del mismo hueco, y
  // consume la promoción (cupón/bono) de forma atómica con la reserva.
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

    let priceCents = ctx.service.priceCents;
    let discountCents = 0;
    let couponId: string | null = null;
    let usedPackageId: string | null = null;

    if (clientPackageId) {
      const pkg = await tx.clientPackage.findFirst({
        where: { id: clientPackageId, clientId, businessId },
        include: { package: { select: { serviceId: true } } },
      });
      const rejection = packageRejection(
        pkg
          ? {
              remainingSessions: pkg.remainingSessions,
              expiresAt: pkg.expiresAt,
              packageServiceId: pkg.package.serviceId,
            }
          : null,
        serviceId,
        now,
      );
      if (rejection) throw new DomainError(rejection, "PACKAGE_INVALID", 409);

      await tx.clientPackage.update({
        where: { id: clientPackageId },
        data: { remainingSessions: { decrement: 1 } },
      });
      // La sesión ya está pagada en el bono: la cita queda a 0
      discountCents = priceCents;
      priceCents = 0;
      usedPackageId = clientPackageId;
    } else if (couponCode) {
      const coupon = await tx.coupon.findUnique({
        where: {
          businessId_code: { businessId, code: couponCode.trim().toUpperCase() },
        },
      });
      const rejection = couponRejection(coupon, now);
      if (rejection) throw new DomainError(rejection, "COUPON_INVALID", 409);

      discountCents = couponDiscountCents(coupon!, priceCents);
      priceCents -= discountCents;
      couponId = coupon!.id;
      await tx.coupon.update({
        where: { id: coupon!.id },
        data: { timesRedeemed: { increment: 1 } },
      });
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
        priceCents,
        discountCents,
        couponId,
        clientPackageId: usedPackageId,
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

  // Cita pagada con bono: si la cancelación es en plazo (o cancela el
  // negocio) se devuelve la sesión; si es tardía, la sesión se pierde —
  // esa es la penalización, no hay cargo adicional (priceCents ya es 0).
  const restorePackageSession =
    !!appointment.clientPackageId && !outcome.late;

  const [updated] = await prisma.$transaction([
    prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: outcome.status,
        chargedCents: outcome.chargedCents,
        cancelledAt: now,
        paymentStatus: collection.paymentStatus,
        paymentRef: collection.paymentRef,
      },
      include: { service: true, business: true },
    }),
    ...(restorePackageSession
      ? [
          prisma.clientPackage.update({
            where: { id: appointment.clientPackageId! },
            data: { remainingSessions: { increment: 1 } },
          }),
        ]
      : []),
  ]);

  await enqueueCancellationNotifications(
    appointmentId,
    outcome.chargedCents,
    now,
  );

  return { appointment: updated, outcome, collection };
}

// ---------------------------------------------------------------------------
// Reprogramación
// ---------------------------------------------------------------------------

// Regla pura de quién puede reprogramar y hasta cuándo. Extraída de
// rescheduleAppointment para poder testearla de forma determinista (sin BD).
// Lanza DomainError; si no lanza, la cita es reprogramable por ese actor.
export function assertReschedulable(params: {
  appointment: { status: string; startAt: Date; clientId: string };
  actorUserId: string;
  actorIsBusinessAdmin: boolean;
  cancellationWindowHours: number;
  now: Date;
}): void {
  const {
    appointment,
    actorUserId,
    actorIsBusinessAdmin,
    cancellationWindowHours,
    now,
  } = params;

  const isOwnerOfAppointment = appointment.clientId === actorUserId;
  if (!isOwnerOfAppointment && !actorIsBusinessAdmin) {
    throw new DomainError("No tienes permiso sobre esta cita", "FORBIDDEN", 403);
  }

  if (appointment.status !== "CONFIRMED") {
    throw new DomainError(
      "Solo se pueden reprogramar citas confirmadas",
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

  // El negocio puede reprogramar en cualquier momento; el cliente solo dentro
  // de la ventana de cancelación gratuita: fuera de plazo únicamente puede
  // cancelar (con el cargo que corresponda).
  if (!actorIsBusinessAdmin) {
    const deadline = cancellationDeadline(
      appointment.startAt,
      cancellationWindowHours,
    );
    if (now.getTime() > deadline.getTime()) {
      throw new DomainError(
        "El plazo para reprogramar ha pasado; fuera de plazo solo se puede cancelar la cita",
        "RESCHEDULE_WINDOW_PASSED",
        422,
      );
    }
  }
}

// Mantiene el profesional original si sigue disponible en el hueco nuevo;
// si no, reasigna con la misma regla de menor carga que una reserva nueva.
export function pickRescheduleStaffId(
  originalStaffId: string | null,
  slotStaffIds: string[],
  dayLoadByStaff: Map<string, number>,
): string | null {
  if (originalStaffId && slotStaffIds.includes(originalStaffId)) {
    return originalStaffId;
  }
  return chooseStaffId(slotStaffIds, dayLoadByStaff);
}

// Mueve una cita CONFIRMED a un hueco nuevo validado con el mismo motor que
// una reserva (horario, antelaciones, cierres, solapamientos), excluyendo la
// propia cita: su hueco actual queda libre al moverla.
export async function rescheduleAppointment(params: {
  appointmentId: string;
  actorUserId: string;
  actorIsBusinessAdmin: boolean;
  newStartAt: Date;
  now?: Date;
  // Aislamiento en profundidad: si se indica, la cita debe pertenecer a este
  // negocio (los callers admin lo pasan para no depender solo del guard).
  expectedBusinessId?: string;
}) {
  const now = params.now ?? new Date();
  const {
    appointmentId,
    actorUserId,
    actorIsBusinessAdmin,
    newStartAt,
    expectedBusinessId,
  } = params;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { business: true },
  });
  if (!appointment) {
    throw new DomainError("Cita no encontrada", "APPOINTMENT_NOT_FOUND", 404);
  }
  if (expectedBusinessId && appointment.businessId !== expectedBusinessId) {
    throw new DomainError("Cita no encontrada", "APPOINTMENT_NOT_FOUND", 404);
  }

  assertReschedulable({
    appointment,
    actorUserId,
    actorIsBusinessAdmin,
    cancellationWindowHours: appointment.business.cancellationWindowHours,
    now,
  });

  const dateISO = toLocalDateISO(newStartAt, appointment.business.timezone);
  const ctx = await loadAvailabilityContext({
    businessId: appointment.businessId,
    serviceId: appointment.serviceId,
    dateISO,
    now,
    excludeAppointmentId: appointmentId,
  });

  // Solo instantes exactamente ofertados por el motor de huecos (mismas
  // garantías que createAppointment: antelación mínima/máxima, horario, etc.)
  const slot = slotsFromContext(ctx).find(
    (s) => s.start.getTime() === newStartAt.getTime(),
  );
  if (!slot) {
    throw new DomainError(
      "El horario seleccionado ya no está disponible",
      "SLOT_TAKEN",
      409,
    );
  }

  const hasStaff = ctx.staff.length > 0;
  const assignedStaffId = hasStaff
    ? pickRescheduleStaffId(
        appointment.staffId,
        slot.staffIds,
        ctx.dayLoadByStaff,
      )
    : null;
  if (hasStaff && !assignedStaffId) {
    throw new DomainError(
      "No hay profesionales disponibles en ese horario",
      "SLOT_TAKEN",
      409,
    );
  }

  const newEndAt = new Date(
    newStartAt.getTime() + ctx.service.durationMinutes * 60_000,
  );

  // Transacción: re-comprueba el solapamiento justo antes de mover la cita
  // (misma protección anti doble-reserva que createAppointment) y anula los
  // recordatorios pendientes, que apuntan a la hora antigua.
  const updated = await prisma.$transaction(async (tx) => {
    const conflict = await tx.appointment.findFirst({
      where: {
        businessId: appointment.businessId,
        id: { not: appointmentId },
        status: { in: [...BLOCKING_STATUSES] },
        startAt: { lt: newEndAt },
        endAt: { gt: newStartAt },
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

    await tx.notification.updateMany({
      where: { appointmentId, status: "PENDING", template: "REMINDER" },
      data: { status: "SKIPPED", lastError: "Cita reprogramada" },
    });

    return tx.appointment.update({
      where: { id: appointmentId },
      data: { startAt: newStartAt, endAt: newEndAt, staffId: assignedStaffId },
      include: {
        service: true,
        business: true,
        staff: { select: { id: true, name: true, color: true } },
      },
    });
  });

  // Nueva confirmación inmediata + recordatorios reprogramados (outbox).
  // No se registra auditoría: src/lib/audit.ts solo cubre eventos de acceso
  // y cancelAppointment tampoco audita (mismo patrón).
  await enqueueBookingNotifications(appointmentId, now);

  return updated;
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
