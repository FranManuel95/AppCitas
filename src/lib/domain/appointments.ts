import { prisma } from "@/lib/prisma";
import {
  computeDaySlots,
  isOfferedSlot,
  type Slot,
  type SlotEngineInput,
} from "./availability";
import { evaluateCancellation } from "./cancellation";
import { DomainError } from "./errors";
import {
  addDaysISO,
  isValidDateISO,
  toLocalDateISO,
  wallTimeToUtc,
} from "./dates";
import {
  BLOCKING_STATUSES,
  type AppointmentStatus,
} from "./types";

// Construye la entrada del motor de huecos para un negocio/servicio/día.
async function buildSlotEngineInput(params: {
  businessId: string;
  serviceId: string;
  dateISO: string;
  now: Date;
  excludeAppointmentId?: string;
}): Promise<SlotEngineInput> {
  const { businessId, serviceId, dateISO, now, excludeAppointmentId } = params;

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

  // Intervalo UTC que cubre el día local del negocio
  const dayStart = wallTimeToUtc(dateISO, "00:00", business.timezone);
  const dayEnd = wallTimeToUtc(addDaysISO(dateISO, 1), "00:00", business.timezone);

  const busy = await prisma.appointment.findMany({
    where: {
      businessId,
      status: { in: [...BLOCKING_STATUSES] },
      startAt: { lt: dayEnd },
      endAt: { gt: dayStart },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { startAt: true, endAt: true },
  });

  return {
    dateISO,
    timezone: business.timezone,
    hours: business.hours,
    closedDates: business.closures.map((c) => c.date),
    busy,
    durationMinutes: service.durationMinutes,
    granularityMinutes: business.slotGranularityMinutes,
    minNoticeMinutes: business.minNoticeMinutes,
    maxAdvanceBookingDays: business.maxAdvanceBookingDays,
    now,
  };
}

export async function getAvailability(params: {
  businessId: string;
  serviceId: string;
  dateISO: string;
  now?: Date;
}): Promise<Slot[]> {
  const input = await buildSlotEngineInput({
    ...params,
    now: params.now ?? new Date(),
  });
  return computeDaySlots(input);
}

export async function createAppointment(params: {
  businessId: string;
  serviceId: string;
  clientId: string;
  startAt: Date;
  notes?: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const { businessId, serviceId, clientId, startAt, notes } = params;

  const business = await prisma.business.findFirst({
    where: { id: businessId, active: true },
    select: { timezone: true },
  });
  if (!business) throw new DomainError("Negocio no encontrado", "BUSINESS_NOT_FOUND", 404);

  const dateISO = toLocalDateISO(startAt, business.timezone);
  const input = await buildSlotEngineInput({ businessId, serviceId, dateISO, now });

  // Solo se aceptan instantes exactamente ofertados por el motor de huecos:
  // valida horario de apertura, antelación mínima, cierres y solapamientos.
  if (!isOfferedSlot(input, startAt)) {
    throw new DomainError(
      "El horario seleccionado ya no está disponible",
      "SLOT_UNAVAILABLE",
      409,
    );
  }

  const service = await prisma.service.findFirstOrThrow({
    where: { id: serviceId, businessId },
    select: { durationMinutes: true, priceCents: true },
  });
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

  // Transacción: re-comprueba el solapamiento justo antes de insertar para
  // cerrar la carrera entre dos reservas simultáneas del mismo hueco.
  return prisma.$transaction(async (tx) => {
    const conflict = await tx.appointment.findFirst({
      where: {
        businessId,
        status: { in: [...BLOCKING_STATUSES] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
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
        startAt,
        endAt,
        status: "CONFIRMED",
        priceCents: service.priceCents,
        notes: notes?.trim() || null,
      },
      include: { service: true, business: true },
    });
  });
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
    include: { business: true },
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
  const outcome = actorIsBusinessAdmin && !isOwnerOfAppointment
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

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: outcome.status,
      chargedCents: outcome.chargedCents,
      cancelledAt: now,
    },
    include: { service: true, business: true },
  });

  return { appointment: updated, outcome };
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
    include: { business: true },
  });
  if (!appointment) {
    throw new DomainError("Cita no encontrada", "APPOINTMENT_NOT_FOUND", 404);
  }

  let chargedCents = appointment.chargedCents;
  switch (status) {
    case "COMPLETED":
      chargedCents = appointment.priceCents;
      break;
    case "NO_SHOW":
      // Un no-show recibe el mismo cargo que una cancelación tardía
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
    case "CANCELLED_LATE":
      chargedCents = Math.round(
        (appointment.priceCents *
          appointment.business.lateCancellationFeePercent) /
          100,
      );
      break;
  }

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status,
      chargedCents,
      cancelledAt:
        status === "CANCELLED" || status === "CANCELLED_LATE"
          ? (appointment.cancelledAt ?? new Date())
          : null,
    },
    include: { service: true, client: { select: { id: true, name: true, email: true } } },
  });
}
