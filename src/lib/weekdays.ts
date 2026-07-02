// 0 = domingo … 6 = sábado (convención Date.getDay)
export const WEEKDAYS_ES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

export const WEEKDAYS_EN = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function weekdayNames(locale: string): readonly string[] {
  return locale === "en" ? WEEKDAYS_EN : WEEKDAYS_ES;
}

// Orden habitual de presentación en España: lunes primero
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
