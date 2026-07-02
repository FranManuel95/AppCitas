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

// Estados que ocupan hueco en la agenda (una cita cancelada libera su hueco)
export const BLOCKING_STATUSES: AppointmentStatus[] = ["CONFIRMED", "COMPLETED"];

// Roles con acceso al panel de administración de un negocio
export const ADMIN_ROLES: Role[] = ["OWNER", "STAFF", "SUPER_ADMIN"];

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  CONFIRMED: "Confirmada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  CANCELLED_LATE: "Cancelación tardía",
  NO_SHOW: "No presentado",
};
