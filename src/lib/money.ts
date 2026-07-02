// Los importes se almacenan siempre como enteros en céntimos: evita errores de
// coma flotante y es portable entre SQLite y PostgreSQL.

export function formatCents(
  cents: number,
  currency = "EUR",
  locale = "es-ES",
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    cents / 100,
  );
}

export function unitsToCents(units: number): number {
  return Math.round(units * 100);
}

export function centsToUnits(cents: number): number {
  return cents / 100;
}
