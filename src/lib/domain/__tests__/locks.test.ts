import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { lockBusinessForBooking } from "../locks";

// El bloqueo de reserva serializa las transacciones concurrentes en PostgreSQL
// (READ COMMITTED no basta) y es un no-op en SQLite, donde las transacciones ya
// serializan. Aquí se comprueba esa selección por proveedor sin tocar la BD:
// se le pasa un `tx` falso que registra si se emitió el advisory lock.

function fakeTx() {
  const executeRaw = vi.fn().mockResolvedValue(1);
  const tx = { $executeRaw: executeRaw } as unknown as Prisma.TransactionClient;
  return { tx, executeRaw };
}

describe("lockBusinessForBooking", () => {
  const original = process.env.DATABASE_URL;
  afterEach(() => {
    process.env.DATABASE_URL = original;
  });

  it("emite pg_advisory_xact_lock en PostgreSQL", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@host:5432/db";
    const { tx, executeRaw } = fakeTx();

    await lockBusinessForBooking(tx, "biz-1");

    expect(executeRaw).toHaveBeenCalledTimes(1);
    // El template tag recibe las partes de la plantilla y el businessId aparte.
    const [strings, arg] = executeRaw.mock.calls[0] as [string[], string];
    expect(strings.join("?")).toContain("pg_advisory_xact_lock");
    expect(arg).toBe("biz-1");
  });

  it("es un no-op en SQLite (dev/tests)", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { tx, executeRaw } = fakeTx();

    await lockBusinessForBooking(tx, "biz-1");

    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("es un no-op si no hay DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    const { tx, executeRaw } = fakeTx();

    await lockBusinessForBooking(tx, "biz-1");

    expect(executeRaw).not.toHaveBeenCalled();
  });
});
