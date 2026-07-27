import { wallTimeToUtc, weekdayOfDateISO } from "./dates";

// Motor de disponibilidad. Función pura: recibe todo su contexto como
// argumentos (incluido `now`) para poder testearla de forma determinista.

export interface HourRange {
  weekday: number;
  openTime: string; // "HH:mm"
  closeTime: string; // "HH:mm"
}

export interface BusyInterval {
  startAt: Date;
  endAt: Date;
}

export interface SlotEngineInput {
  dateISO: string; // "YYYY-MM-DD" en la zona horaria del negocio
  timezone: string;
  hours: HourRange[]; // tramos semanales del negocio
  closedDates?: string[]; // festivos / cierres puntuales ("YYYY-MM-DD")
  busy: BusyInterval[]; // citas que bloquean agenda ese día (UTC)
  durationMinutes: number;
  // Margen del SERVICIO que se reserva (limpieza/preparación): el hueco
  // exige libre [start − before, end + after]. No cambia la hora ni la
  // duración visible del hueco, solo el bloqueo. Los intervalos `busy`
  // llegan YA expandidos con los buffers de sus propios servicios, así que
  // los márgenes de ambos lados se suman (estándar del sector).
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  granularityMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceBookingDays: number;
  now: Date;
}

export interface Slot {
  start: Date;
  end: Date;
}

export function computeDaySlots(input: SlotEngineInput): Slot[] {
  const {
    dateISO,
    timezone,
    hours,
    closedDates = [],
    busy,
    durationMinutes,
    bufferBeforeMinutes = 0,
    bufferAfterMinutes = 0,
    granularityMinutes,
    minNoticeMinutes,
    maxAdvanceBookingDays,
    now,
  } = input;

  if (durationMinutes <= 0 || granularityMinutes <= 0) return [];
  if (closedDates.includes(dateISO)) return [];

  const weekday = weekdayOfDateISO(dateISO);
  const dayRanges = hours.filter((h) => h.weekday === weekday);
  if (dayRanges.length === 0) return [];

  const earliestStart = new Date(now.getTime() + minNoticeMinutes * 60_000);
  const latestStart = new Date(
    now.getTime() + maxAdvanceBookingDays * 24 * 3_600_000,
  );

  const durationMs = durationMinutes * 60_000;
  const stepMs = granularityMinutes * 60_000;

  // Map por instante de inicio: deduplica huecos si hay tramos solapados.
  const slots = new Map<number, Slot>();

  for (const range of dayRanges) {
    const open = wallTimeToUtc(dateISO, range.openTime, timezone);
    const close = wallTimeToUtc(dateISO, range.closeTime, timezone);

    for (
      let start = open.getTime();
      start + durationMs <= close.getTime();
      start += stepMs
    ) {
      const end = start + durationMs;
      if (start < earliestStart.getTime()) continue;
      if (start > latestStart.getTime()) continue;

      // El buffer no recorta contra el horario de apertura (el primer y el
      // último hueco del día no se pierden): solo se compara contra `busy`.
      const blockStart = start - bufferBeforeMinutes * 60_000;
      const blockEnd = end + bufferAfterMinutes * 60_000;
      const overlaps = busy.some(
        (b) => blockStart < b.endAt.getTime() && blockEnd > b.startAt.getTime(),
      );
      if (overlaps) continue;

      slots.set(start, { start: new Date(start), end: new Date(end) });
    }
  }

  return [...slots.values()].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
}

// Comprueba si un instante concreto coincide con un hueco ofertado.
// Se usa al crear la cita para impedir reservas en horas arbitrarias.
export function isOfferedSlot(input: SlotEngineInput, startAt: Date): boolean {
  return computeDaySlots(input).some(
    (s) => s.start.getTime() === startAt.getTime(),
  );
}

// ---------------------------------------------------------------------------
// Multi-empleado
// ---------------------------------------------------------------------------

export interface StaffAgendaContext {
  id: string;
  // Horario propio del empleado; si está vacío hereda el del negocio
  hours: HourRange[];
  // Citas que bloquean SU agenda ese día (incluye las citas sin empleado
  // asignado, que se consideran de sala y bloquean a todos)
  busy: BusyInterval[];
}

export interface StaffSlot extends Slot {
  staffIds: string[]; // empleados disponibles en ese hueco
}

// Unión de los huecos de cada empleado cualificado: un hueco se oferta si al
// menos un empleado puede atenderlo, y lleva la lista de candidatos.
export function computeStaffDaySlots(
  base: Omit<SlotEngineInput, "busy" | "hours">,
  businessHours: HourRange[],
  staff: StaffAgendaContext[],
): StaffSlot[] {
  const merged = new Map<number, StaffSlot>();

  for (const member of staff) {
    const slots = computeDaySlots({
      ...base,
      hours: member.hours.length > 0 ? member.hours : businessHours,
      busy: member.busy,
    });
    for (const slot of slots) {
      const key = slot.start.getTime();
      const existing = merged.get(key);
      if (existing) {
        existing.staffIds.push(member.id);
      } else {
        merged.set(key, { ...slot, staffIds: [member.id] });
      }
    }
  }

  return [...merged.values()].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
}

// Candidatos de un hueco ordenados por preferencia de asignación automática:
// menos carga (citas del día) primero; a igual carga, orden estable.
export function rankStaffIds(
  candidates: string[],
  dayLoadByStaff: Map<string, number>,
): string[] {
  return [...candidates].sort((a, b) => {
    const loadDiff =
      (dayLoadByStaff.get(a) ?? 0) - (dayLoadByStaff.get(b) ?? 0);
    return loadDiff !== 0 ? loadDiff : a.localeCompare(b);
  });
}

// Asignación automática: entre los candidatos de un hueco, elige el empleado
// con menos carga (citas del día). Determinista: a igual carga, orden estable.
export function chooseStaffId(
  candidates: string[],
  dayLoadByStaff: Map<string, number>,
): string | null {
  return rankStaffIds(candidates, dayLoadByStaff)[0] ?? null;
}
