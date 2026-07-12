import { describe, expect, it } from "vitest";
import { computeOnboardingSteps } from "../onboarding";

const T0 = new Date("2026-07-12T10:00:00.000Z");
const T0_PLUS_1S = new Date("2026-07-12T10:00:01.000Z"); // dentro del margen
const T0_PLUS_1H = new Date("2026-07-12T11:00:00.000Z"); // edición real

function base() {
  return {
    services: [] as Array<{ createdAt: Date; updatedAt: Date }>,
    businessHourCount: 0,
    stripeChargesEnabled: false,
    staffCount: 0,
  };
}

// Señales de "primeros pasos": el servicio de ejemplo sembrado en el alta no
// cuenta como personalizado hasta que el dueño lo edite.
describe("computeOnboardingSteps", () => {
  it("negocio recién sembrado: solo el horario está hecho", () => {
    const status = computeOnboardingSteps({
      ...base(),
      services: [{ createdAt: T0, updatedAt: T0 }],
      businessHourCount: 5,
    });
    expect(status.completed).toBe(1);
    expect(status.total).toBe(4);
    const byKey = Object.fromEntries(status.steps.map((s) => [s.key, s]));
    expect(byKey.services.done).toBe(false); // el de ejemplo no cuenta
    expect(byKey.hours.done).toBe(true);
    expect(byKey.payments.done).toBe(false);
    expect(byKey.staff.done).toBe(false);
  });

  it("el updatedAt de la propia creación no marca el paso (margen)", () => {
    const status = computeOnboardingSteps({
      ...base(),
      services: [{ createdAt: T0, updatedAt: T0_PLUS_1S }],
    });
    expect(status.steps.find((s) => s.key === "services")!.done).toBe(false);
  });

  it("editar el servicio de ejemplo completa el paso", () => {
    const status = computeOnboardingSteps({
      ...base(),
      services: [{ createdAt: T0, updatedAt: T0_PLUS_1H }],
    });
    expect(status.steps.find((s) => s.key === "services")!.done).toBe(true);
  });

  it("crear un segundo servicio también completa el paso", () => {
    const status = computeOnboardingSteps({
      ...base(),
      services: [
        { createdAt: T0, updatedAt: T0 },
        { createdAt: T0_PLUS_1H, updatedAt: T0_PLUS_1H },
      ],
    });
    expect(status.steps.find((s) => s.key === "services")!.done).toBe(true);
  });

  it("cobros y equipo son opcionales pero cuentan para el total", () => {
    const status = computeOnboardingSteps({
      ...base(),
      services: [{ createdAt: T0, updatedAt: T0_PLUS_1H }],
      businessHourCount: 5,
      stripeChargesEnabled: true,
      staffCount: 2,
    });
    expect(status.completed).toBe(4);
    const optional = status.steps.filter((s) => s.optional).map((s) => s.key);
    expect(optional.sort()).toEqual(["payments", "staff"]);
  });
});
