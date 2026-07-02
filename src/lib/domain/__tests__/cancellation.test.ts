import { describe, expect, it } from "vitest";
import {
  cancellationDeadline,
  evaluateCancellation,
} from "../cancellation";

const POLICY = { windowHours: 24, feePercent: 100 };

describe("evaluateCancellation — regla de negocio central", () => {
  const startAt = new Date("2026-07-10T10:00:00Z");

  it("cancelación con más de 24h de antelación es gratuita", () => {
    const now = new Date("2026-07-09T09:59:59Z"); // 24h y 1s antes
    const outcome = evaluateCancellation(startAt, now, POLICY, 4500);

    expect(outcome.late).toBe(false);
    expect(outcome.status).toBe("CANCELLED");
    expect(outcome.chargedCents).toBe(0);
  });

  it("cancelación exactamente en el límite sigue siendo gratuita", () => {
    const now = new Date("2026-07-09T10:00:00Z"); // exactamente 24h antes
    const outcome = evaluateCancellation(startAt, now, POLICY, 4500);

    expect(outcome.late).toBe(false);
    expect(outcome.chargedCents).toBe(0);
  });

  it("cancelación con menos de 24h cobra el importe íntegro (100%)", () => {
    const now = new Date("2026-07-09T10:00:01Z"); // 1s dentro de la ventana
    const outcome = evaluateCancellation(startAt, now, POLICY, 4500);

    expect(outcome.late).toBe(true);
    expect(outcome.status).toBe("CANCELLED_LATE");
    expect(outcome.chargedCents).toBe(4500);
  });

  it("cancelación una hora antes de la cita cobra el cargo", () => {
    const now = new Date("2026-07-10T09:00:00Z");
    const outcome = evaluateCancellation(startAt, now, POLICY, 2500);

    expect(outcome.late).toBe(true);
    expect(outcome.chargedCents).toBe(2500);
  });

  it("el porcentaje de cargo configurable se aplica y redondea", () => {
    const now = new Date("2026-07-10T09:00:00Z");
    const outcome = evaluateCancellation(
      startAt,
      now,
      { windowHours: 24, feePercent: 50 },
      2295, // 50% = 1147.5 → 1148
    );

    expect(outcome.chargedCents).toBe(1148);
  });

  it("con ventana distinta (48h) el límite se desplaza", () => {
    const now = new Date("2026-07-08T11:00:00Z"); // 47h antes
    const outcome = evaluateCancellation(
      startAt,
      now,
      { windowHours: 48, feePercent: 100 },
      3000,
    );

    expect(outcome.late).toBe(true);
    expect(outcome.chargedCents).toBe(3000);
  });

  it("fee del 0% no genera cargo aunque sea tardía", () => {
    const now = new Date("2026-07-10T09:00:00Z");
    const outcome = evaluateCancellation(
      startAt,
      now,
      { windowHours: 24, feePercent: 0 },
      3000,
    );

    expect(outcome.late).toBe(true);
    expect(outcome.status).toBe("CANCELLED_LATE");
    expect(outcome.chargedCents).toBe(0);
  });
});

describe("cancellationDeadline", () => {
  it("devuelve el instante límite exacto", () => {
    const startAt = new Date("2026-07-10T10:00:00Z");
    expect(cancellationDeadline(startAt, 24).toISOString()).toBe(
      "2026-07-09T10:00:00.000Z",
    );
  });
});
