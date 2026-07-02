import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimiter } from "../rate-limit";

const RULE = { limit: 3, windowMs: 60_000 };

describe("checkRateLimit — ventana deslizante", () => {
  beforeEach(() => resetRateLimiter());

  it("permite hasta el límite dentro de la ventana", () => {
    const t0 = 1_000_000;
    expect(checkRateLimit("k", RULE, t0).ok).toBe(true);
    expect(checkRateLimit("k", RULE, t0 + 1000).ok).toBe(true);
    expect(checkRateLimit("k", RULE, t0 + 2000).ok).toBe(true);
    const fourth = checkRateLimit("k", RULE, t0 + 3000);
    expect(fourth.ok).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("la ventana desliza: pasado el margen vuelve a permitir", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit("k", RULE, t0 + i * 1000);
    expect(checkRateLimit("k", RULE, t0 + 5000).ok).toBe(false);
    // El primer intento sale de la ventana → hay hueco de nuevo
    expect(checkRateLimit("k", RULE, t0 + 61_000).ok).toBe(true);
  });

  it("claves distintas no comparten cupo", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit("a", RULE, t0);
    expect(checkRateLimit("a", RULE, t0).ok).toBe(false);
    expect(checkRateLimit("b", RULE, t0).ok).toBe(true);
  });

  it("informa del tiempo de espera correcto", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit("k", RULE, t0);
    const blocked = checkRateLimit("k", RULE, t0 + 30_000);
    expect(blocked.retryAfterSeconds).toBe(30); // faltan 30s del primer hit
  });
});
