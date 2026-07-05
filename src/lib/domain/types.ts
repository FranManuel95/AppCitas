// Valores válidos para los campos String del schema (SQLite no soporta enums).

export const ROLES = ["CLIENT", "OWNER", "STAFF", "SUPER_ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const APPOINTMENT_STATUSES = [
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "CANCELLED_LATE",
  "NO_SHOW",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

// Forma de pago de una cita cobrada. CARD_ONLINE la fija el sistema al cobrar
// un no-show con la tarjeta guardada; las otras las registra el negocio a mano.
export const PAYMENT_METHODS = ["CASH", "CARD_TERMINAL", "CARD_ONLINE"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Las que el negocio elige al completar una cita (cobro presencial en el local).
export const IN_PERSON_PAYMENT_METHODS = ["CASH", "CARD_TERMINAL"] as const;
export type InPersonPaymentMethod = (typeof IN_PERSON_PAYMENT_METHODS)[number];

// Estados que ocupan hueco en la agenda (una cita cancelada libera su hueco)
export const BLOCKING_STATUSES: AppointmentStatus[] = ["CONFIRMED", "COMPLETED"];

// Roles con acceso al panel de administración de un negocio.
// STAFF no administra: tiene su propio portal (/personal) con su agenda.
export const ADMIN_ROLES: Role[] = ["OWNER", "SUPER_ADMIN"];

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  CONFIRMED: "Confirmada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  CANCELLED_LATE: "Cancelación tardía",
  NO_SHOW: "No presentado",
};
