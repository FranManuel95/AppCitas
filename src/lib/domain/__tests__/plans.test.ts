import { describe, expect, it } from "vitest";
import { effectivePlan, planFor, PLANS } from "../plans";

describe("planFor", () => {
  it("devuelve el plan pedido", () => {
    expect(planFor("pro").id).toBe("pro");
    expect(planFor("free").id).toBe("free");
  });

  it("cae a free ante un plan desconocido", () => {
    expect(planFor("enterprise").id).toBe("free");
    expect(planFor("").id).toBe("free");
  });
});

describe("effectivePlan — degradación por estado de suscripción", () => {
  it("respeta el plan de pago si está activo o en prueba", () => {
    expect(
      effectivePlan({ plan: "pro", subscriptionStatus: "active" }).id,
    ).toBe("pro");
    expect(
      effectivePlan({ plan: "pro", subscriptionStatus: "trialing" }).id,
    ).toBe("pro");
  });

  it("degrada a free si la suscripción no está activa", () => {
    expect(
      effectivePlan({ plan: "pro", subscriptionStatus: "canceled" }).id,
    ).toBe("free");
    expect(
      effectivePlan({ plan: "pro", subscriptionStatus: "past_due" }).id,
    ).toBe("free");
  });

  it("free sigue siendo free en cualquier estado", () => {
    expect(
      effectivePlan({ plan: "free", subscriptionStatus: "active" }).id,
    ).toBe("free");
  });
});

describe("límites de plan", () => {
  it("free es limitado y pro ilimitado", () => {
    expect(PLANS.free.limits.staff).toBe(1);
    expect(PLANS.free.limits.monthlyAppointments).toBe(50);
    expect(PLANS.pro.limits.staff).toBeNull();
    expect(PLANS.pro.limits.monthlyAppointments).toBeNull();
  });
});
