// Política de cancelación. Regla de negocio central de la app:
// cancelar con antelación >= ventana configurada (24h por defecto) es gratis;
// cancelar más tarde genera el cargo configurado (100% del precio por defecto).
// Función pura y determinista: `now` se inyecta para poder testearla.

export interface CancellationPolicy {
  windowHours: number;
  feePercent: number; // 0..100
}

export interface CancellationOutcome {
  late: boolean;
  status: "CANCELLED" | "CANCELLED_LATE";
  chargedCents: number;
  deadline: Date; // último instante para cancelar sin cargo
}

export function evaluateCancellation(
  startAt: Date,
  now: Date,
  policy: CancellationPolicy,
  priceCents: number,
): CancellationOutcome {
  const deadline = new Date(
    startAt.getTime() - policy.windowHours * 3_600_000,
  );
  const late = now.getTime() > deadline.getTime();
  const chargedCents = late
    ? Math.round((priceCents * policy.feePercent) / 100)
    : 0;

  return {
    late,
    status: late ? "CANCELLED_LATE" : "CANCELLED",
    chargedCents,
    deadline,
  };
}

export function cancellationDeadline(
  startAt: Date,
  windowHours: number,
): Date {
  return new Date(startAt.getTime() - windowHours * 3_600_000);
}
