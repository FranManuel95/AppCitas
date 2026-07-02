import { describe, expect, it } from "vitest";
import {
  couponDiscountCents,
  couponRejection,
  packageRejection,
} from "../promotions";

const NOW = new Date("2026-07-02T10:00:00Z");

describe("couponDiscountCents", () => {
  it("porcentaje: redondea al céntimo", () => {
    expect(couponDiscountCents({ type: "PERCENT", value: 10 }, 2295)).toBe(230);
  });

  it("importe fijo en céntimos", () => {
    expect(couponDiscountCents({ type: "FIXED", value: 500 }, 2000)).toBe(500);
  });

  it("el descuento nunca supera el precio", () => {
    expect(couponDiscountCents({ type: "FIXED", value: 5000 }, 2000)).toBe(2000);
    expect(couponDiscountCents({ type: "PERCENT", value: 100 }, 2000)).toBe(2000);
  });
});

describe("couponRejection", () => {
  const base = {
    type: "PERCENT",
    value: 10,
    active: true,
    expiresAt: null,
    maxRedemptions: null,
    timesRedeemed: 0,
  };

  it("cupón válido → null", () => {
    expect(couponRejection(base, NOW)).toBeNull();
  });

  it("inexistente o inactivo", () => {
    expect(couponRejection(null, NOW)).toMatch(/no existe/);
    expect(couponRejection({ ...base, active: false }, NOW)).toMatch(/no existe/);
  });

  it("caducado", () => {
    expect(
      couponRejection(
        { ...base, expiresAt: new Date("2026-07-01T00:00:00Z") },
        NOW,
      ),
    ).toMatch(/caducado/);
  });

  it("usos agotados", () => {
    expect(
      couponRejection({ ...base, maxRedemptions: 5, timesRedeemed: 5 }, NOW),
    ).toMatch(/agotado/);
  });
});

describe("packageRejection", () => {
  const base = {
    remainingSessions: 3,
    expiresAt: null,
    packageServiceId: "svc1",
  };

  it("bono válido para su servicio → null", () => {
    expect(packageRejection(base, "svc1", NOW)).toBeNull();
  });

  it("servicio distinto", () => {
    expect(packageRejection(base, "svc2", NOW)).toMatch(/no cubre/);
  });

  it("sin sesiones restantes", () => {
    expect(
      packageRejection({ ...base, remainingSessions: 0 }, "svc1", NOW),
    ).toMatch(/sesiones/);
  });

  it("caducado", () => {
    expect(
      packageRejection(
        { ...base, expiresAt: new Date("2026-06-01T00:00:00Z") },
        "svc1",
        NOW,
      ),
    ).toMatch(/caducado/);
  });
});
