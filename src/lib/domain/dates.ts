import { TZDate } from "@date-fns/tz";

// Convierte una hora de pared ("YYYY-MM-DD" + "HH:mm") en la zona horaria del
// negocio a un instante UTC. Toda la persistencia trabaja en UTC; la zona
// horaria solo interviene al presentar u ofertar huecos.
export function wallTimeToUtc(
  dateISO: string,
  time: string,
  timezone: string,
): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const zoned = new TZDate(y, m - 1, d, hh, mm, 0, timezone);
  return new Date(zoned.getTime());
}

// "YYYY-MM-DD" de un instante visto desde la zona horaria del negocio.
export function toLocalDateISO(instant: Date, timezone: string): string {
  const zoned = new TZDate(instant.getTime(), timezone);
  const y = zoned.getFullYear();
  const m = String(zoned.getMonth() + 1).padStart(2, "0");
  const d = String(zoned.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// "HH:mm" de un instante visto desde la zona horaria del negocio.
export function toLocalTime(instant: Date, timezone: string): string {
  const zoned = new TZDate(instant.getTime(), timezone);
  const hh = String(zoned.getHours()).padStart(2, "0");
  const mm = String(zoned.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// Día de la semana (0=domingo … 6=sábado) de una fecha de calendario.
// Es independiente de la zona horaria: una fecha de calendario ya identifica
// su día de la semana.
export function weekdayOfDateISO(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function isValidDateISO(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}
