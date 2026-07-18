import { afterEach, describe, expect, it, vi } from "vitest";
import { getPaymentProvider } from "../index";

// Guard de producción de pagos B2C: sin STRIPE_SECRET_KEY, la simulación
// (devProvider) solo es válida fuera de producción; en producción es un error
// de despliegue y debe abortar con 503 en vez de cobrar "SIMULATED" en
// silencio. Mismo criterio que billing/Connect/membresías.
describe("getPaymentProvider (guard de producción)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sin Stripe y fuera de producción devuelve el proveedor simulado", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(getPaymentProvider().name).toBe("dev");
  });

  it("sin Stripe y en producción lanza 503 (PAYMENTS_NOT_CONFIGURED)", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getPaymentProvider()).toThrowError(
      expect.objectContaining({ code: "PAYMENTS_NOT_CONFIGURED", httpStatus: 503 }),
    );
  });

  it("con Stripe configurado devuelve el proveedor real incluso en producción", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("NODE_ENV", "production");
    expect(getPaymentProvider().name).toBe("stripe");
  });
});
