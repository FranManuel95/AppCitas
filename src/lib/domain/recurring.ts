import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  cancelAppointment,
  createAppointment,
  rescheduleAppointment,
} from "./appointments";
import { addDaysISO, toLocalDateISO, toLocalTime, wallTimeToUtc } from "./dates";
import { DomainError } from "./errors";

// Series recurrentes ("María viene todos los martes a las 10"). Las crea el
// negocio desde la cita manual; cada ocurrencia es una cita normal que
// comparte seriesId. Las fechas se generan en hora de pared del negocio
// (mismo "martes 10:00" aunque cambie el horario de verano).

export const RECURRENCE_INTERVAL_DAYS = [7, 14, 28] as const;
export const MAX_SERIES_COUNT = 26;

export interface RecurringResult {
  seriesId: string;
  created: Array<{ id: string; startAt: Date }>;
  // Ocurrencias que no se pudieron crear (hueco ocupado, cierre, cupo…)
  skipped: Array<{ startAt: Date; code: string }>;
}

export async function createRecurringAppointments(params: {
  businessId: string;
  serviceId: string;
  clientId: string;
  startAt: Date;
  staffId?: string;
  notes?: string;
  intervalDays: number;
  count: number;
  now?: Date;
}): Promise<RecurringResult> {
  const { intervalDays, count } = params;
  if (!RECURRENCE_INTERVAL_DAYS.includes(intervalDays as 7 | 14 | 28)) {
    throw new DomainError("Intervalo no válido", "INVALID_INTERVAL");
  }
  if (!Number.isInteger(count) || count < 2 || count > MAX_SERIES_COUNT) {
    throw new DomainError(
      `La serie debe tener entre 2 y ${MAX_SERIES_COUNT} citas`,
      "INVALID_COUNT",
    );
  }

  const business = await prisma.business.findFirst({
    where: { id: params.businessId, active: true },
    select: { timezone: true },
  });
  if (!business) {
    throw new DomainError("Negocio no encontrado", "BUSINESS_NOT_FOUND", 404);
  }

  // Hora de pared de la primera cita: cada ocurrencia repite ese "HH:mm"
  // local k×intervalo días después.
  const baseDateISO = toLocalDateISO(params.startAt, business.timezone);
  const wallTime = toLocalTime(params.startAt, business.timezone);

  const seriesId = `ser_${randomBytes(12).toString("hex")}`;
  const created: RecurringResult["created"] = [];
  const skipped: RecurringResult["skipped"] = [];
  let firstError: DomainError | null = null;

  for (let k = 0; k < count; k++) {
    const occStart = wallTimeToUtc(
      addDaysISO(baseDateISO, k * intervalDays),
      wallTime,
      business.timezone,
    );
    try {
      const appt = await createAppointment({
        businessId: params.businessId,
        serviceId: params.serviceId,
        clientId: params.clientId,
        startAt: occStart,
        staffId: params.staffId,
        notes: params.notes,
        bookedBy: "business",
        seriesId,
        suppressConfirmation: created.length > 0,
        now: params.now,
      });
      created.push({ id: appt.id, startAt: appt.startAt });
    } catch (error) {
      if (error instanceof DomainError) {
        firstError ??= error;
        skipped.push({ startAt: occStart, code: error.code });
      } else {
        throw error;
      }
    }
  }

  if (created.length === 0) {
    throw (
      firstError ??
      new DomainError("No se pudo crear la serie", "SERIES_EMPTY", 409)
    );
  }
  return { seriesId, created, skipped };
}

/** Días de calendario entre dos fechas ISO (b - a; puede ser negativo). */
function daysBetweenISO(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}

/**
 * Mueve lo que queda de una serie: el nuevo inicio se aplica a la PRÓXIMA
 * ocurrencia futura y las demás se desplazan el mismo delta de días
 * adoptando la misma hora de pared (patrón intacto, incluidos los huecos de
 * ocurrencias omitidas). Cada movimiento revalida disponibilidad con
 * rescheduleAppointment; los conflictos se omiten y se reportan.
 */
export async function rescheduleSeriesRemainder(params: {
  businessId: string;
  seriesId: string;
  actorUserId: string;
  newStartAt: Date;
  now?: Date;
}): Promise<{
  moved: Array<{ id: string; startAt: Date }>;
  skipped: Array<{ startAt: Date; code: string }>;
}> {
  const now = params.now ?? new Date();
  const pending = await prisma.appointment.findMany({
    where: {
      businessId: params.businessId,
      seriesId: params.seriesId,
      status: "CONFIRMED",
      startAt: { gt: now },
    },
    select: { id: true, startAt: true },
    orderBy: { startAt: "asc" },
  });
  if (pending.length === 0) {
    throw new DomainError(
      "La serie no tiene citas futuras que mover",
      "SERIES_EMPTY",
      404,
    );
  }

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: params.businessId },
    select: { timezone: true },
  });
  const tz = business.timezone;
  const deltaDays = daysBetweenISO(
    toLocalDateISO(pending[0].startAt, tz),
    toLocalDateISO(params.newStartAt, tz),
  );
  const wallTime = toLocalTime(params.newStartAt, tz);

  const moved: Array<{ id: string; startAt: Date }> = [];
  const skipped: Array<{ startAt: Date; code: string }> = [];
  for (const occurrence of pending) {
    const targetDate = addDaysISO(
      toLocalDateISO(occurrence.startAt, tz),
      deltaDays,
    );
    const target = wallTimeToUtc(targetDate, wallTime, tz);
    try {
      const updated = await rescheduleAppointment({
        appointmentId: occurrence.id,
        actorUserId: params.actorUserId,
        actorIsBusinessAdmin: true,
        newStartAt: target,
        now,
        expectedBusinessId: params.businessId,
      });
      moved.push({ id: updated.id, startAt: updated.startAt });
    } catch (error) {
      if (error instanceof DomainError) {
        skipped.push({ startAt: target, code: error.code });
      } else {
        throw error;
      }
    }
  }
  if (moved.length === 0) {
    throw new DomainError(
      "Ningún hueco del nuevo horario está libre",
      skipped[0]?.code ?? "SLOT_TAKEN",
      409,
    );
  }
  return { moved, skipped };
}

// Cancela lo que queda de una serie (citas CONFIRMED futuras). Cancela el
// negocio → sin cargo para el cliente, igual que cancelar una a una.
export async function cancelSeriesRemainder(params: {
  businessId: string;
  seriesId: string;
  actorUserId: string;
  now?: Date;
}): Promise<{ cancelled: number }> {
  const now = params.now ?? new Date();
  const pending = await prisma.appointment.findMany({
    where: {
      businessId: params.businessId,
      seriesId: params.seriesId,
      status: "CONFIRMED",
      startAt: { gt: now },
    },
    select: { id: true },
    orderBy: { startAt: "asc" },
  });

  let cancelled = 0;
  for (const appt of pending) {
    await cancelAppointment({
      appointmentId: appt.id,
      actorUserId: params.actorUserId,
      actorIsBusinessAdmin: true,
      now,
    });
    cancelled += 1;
  }
  return { cancelled };
}
