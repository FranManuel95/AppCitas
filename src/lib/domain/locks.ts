import type { Prisma } from "@/generated/prisma/client";

/**
 * Bloqueo de asesoría (advisory lock) de ámbito de transacción para serializar
 * las reservas concurrentes de un mismo negocio y evitar la doble reserva.
 *
 * El chequeo anti-solapamiento con `findFirst` NO es suficiente bajo el
 * aislamiento READ COMMITTED de PostgreSQL: dos transacciones concurrentes no
 * ven sus inserciones mutuas y ambas pueden pasar el chequeo. Un
 * `pg_advisory_xact_lock` tomado al inicio de la transacción las serializa (se
 * libera solo al hacer COMMIT/ROLLBACK).
 *
 * Se bloquea por NEGOCIO (no por profesional) porque una reserva sin empleado
 * asignado ("cualquiera disponible") puede chocar con las de cualquier
 * profesional; esa es la única granularidad correcta. La contención real es
 * mínima: solo compiten reservas simultáneas del mismo negocio.
 *
 * En SQLite (desarrollo/tests) las transacciones ya serializan de por sí, así
 * que es un no-op — igual que el patrón de proveedor de src/lib/rate-limit.ts.
 */
export async function lockBusinessForBooking(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<void> {
  const isPostgres = (process.env.DATABASE_URL ?? "").startsWith("postgres");
  if (!isPostgres) return;
  // 4711 = espacio de nombres arbitrario para no colisionar con otros locks.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(4711, hashtext(${businessId}))`;
}

/**
 * Serializa la EMISIÓN DE FACTURAS de un negocio: la numeración correlativa
 * sin huecos exige que solo una transacción lea/incremente el contador a la
 * vez. Espacio de nombres propio (4712): facturar no debe encolar detrás de
 * las reservas ni al revés.
 */
export async function lockBusinessForInvoicing(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<void> {
  const isPostgres = (process.env.DATABASE_URL ?? "").startsWith("postgres");
  if (!isPostgres) return;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(4712, hashtext(${businessId}))`;
}
