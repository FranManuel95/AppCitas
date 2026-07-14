import { prisma } from "@/lib/prisma";
import { DomainError } from "./errors";
import { isValidDateISO } from "./dates";

// Cierres del negocio por rango de fechas (p. ej. una semana de vacaciones).
// El modelo Closure es de fecha única (@@unique[businessId,date]): un rango se
// materializa como una fila por día. Se saltan los días ya cerrados sin usar
// skipDuplicates (no portable a SQLite): se filtran los existentes a mano.

export const MAX_CLOSURE_RANGE_DAYS = 90;

// Enumera las fechas "YYYY-MM-DD" de start a end (ambas inclusive).
function enumerateDates(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${startISO}T00:00:00Z`);
  const end = new Date(`${endISO}T00:00:00Z`);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

// Crea un cierre por cada día del rango [startISO, endISO] que no lo esté ya.
// Devuelve cuántos se crearon (0 si todos existían).
export async function createClosureRange(
  businessId: string,
  startISO: string,
  endISO: string,
  reason?: string | null,
): Promise<number> {
  if (!isValidDateISO(startISO) || !isValidDateISO(endISO) || endISO < startISO) {
    throw new DomainError("Rango de fechas no válido", "INVALID_DATE");
  }
  const dates = enumerateDates(startISO, endISO);
  if (dates.length > MAX_CLOSURE_RANGE_DAYS) {
    throw new DomainError(
      `El rango no puede superar ${MAX_CLOSURE_RANGE_DAYS} días`,
      "RANGE_TOO_LONG",
    );
  }
  const already = await prisma.closure.findMany({
    where: { businessId, date: { in: dates } },
    select: { date: true },
  });
  const seen = new Set(already.map((c) => c.date));
  const toCreate = dates.filter((d) => !seen.has(d));
  if (toCreate.length > 0) {
    await prisma.closure.createMany({
      data: toCreate.map((date) => ({ businessId, date, reason: reason || null })),
    });
  }
  return toCreate.length;
}
