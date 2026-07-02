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

// Orden habitual de presentación en España: lunes primero
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
