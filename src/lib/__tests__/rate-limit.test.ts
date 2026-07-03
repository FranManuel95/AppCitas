import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, MemoryRateLimitStore } from "../rate-limit";

const RULE = { limit: 3, windowMs: 60_000 };
const store = new MemoryRateLimitStore();

describe("checkRateLimit — ventana fija con almacén compartido", () => {
  beforeEach(() => store.clear());

  it("permite hasta el límite dentro de la ventana", async () => {
    const t0 = 1_020_000; // dentro de la ventana [1.020.000, 1.080.000)
    expect((await checkRateLimit("k", RULE, t0, store)).ok).toBe(true);
    expect((await checkRateLimit("k", RULE, t0 + 1000, store)).ok).toBe(true);
    expect((await checkRateLimit("k", RULE, t0 + 2000, store)).ok).toBe(true);
    const fourth = await checkRateLimit("k", RULE, t0 + 3000, store);
    expect(fourth.ok).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("al empezar la ventana siguiente vuelve a permitir", async () => {
    const t0 = 1_020_000;
    for (let i = 0; i < 4; i++) await checkRateLimit("k", RULE, t0 + i, store);
    expect((await checkRateLimit("k", RULE, t0 + 5000, store)).ok).toBe(false);
    // 1.080.000 abre ventana nueva → cupo fresco
    expect((await checkRateLimit("k", RULE, 1_080_000, store)).ok).toBe(true);
  });

  it("claves distintas no comparten cupo", async () => {
    const t0 = 1_020_000;
    for (let i = 0; i < 3; i++) await checkRateLimit("a", RULE, t0, store);
    expect((await checkRateLimit("a", RULE, t0, store)).ok).toBe(false);
    expect((await checkRateLimit("b", RULE, t0, store)).ok).toBe(true);
  });

  it("informa del tiempo restante de la ventana", async () => {
    // Ventana [1.020.000, 1.080.000): bloqueado en el segundo 30 → quedan 30
    for (let i = 0; i < 3; i++)
      await checkRateLimit("k", RULE, 1_020_000, store);
    const blocked = await checkRateLimit("k", RULE, 1_050_000, store);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(30);
  });

  it("remaining decrece con cada intento permitido", async () => {
    const t0 = 1_020_000;
    expect((await checkRateLimit("k", RULE, t0, store)).remaining).toBe(2);
    expect((await checkRateLimit("k", RULE, t0, store)).remaining).toBe(1);
    expect((await checkRateLimit("k", RULE, t0, store)).remaining).toBe(0);
  });
});
