import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb, seedBusiness } from "@/lib/test/factories";
import { createClosureRange } from "../closures";

describe("cierres por rango (BD)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("crea una fila por día del rango (ambos inclusive)", async () => {
    const { businessId } = await seedBusiness();
    const created = await createClosureRange(
      businessId,
      "2026-08-10",
      "2026-08-14",
      "Vacaciones",
    );
    expect(created).toBe(5);
    const rows = await prisma.closure.findMany({
      where: { businessId },
      orderBy: { date: "asc" },
    });
    expect(rows.map((r) => r.date)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
    ]);
  });

  it("deduplica: no repite días ya cerrados", async () => {
    const { businessId } = await seedBusiness();
    await prisma.closure.create({
      data: { businessId, date: "2026-08-11" },
    });
    const created = await createClosureRange(businessId, "2026-08-10", "2026-08-12");
    // Solo el 10 y el 12 son nuevos (el 11 ya existía).
    expect(created).toBe(2);
    expect(await prisma.closure.count({ where: { businessId } })).toBe(3);
  });

  it("rechaza un rango invertido", async () => {
    const { businessId } = await seedBusiness();
    await expect(
      createClosureRange(businessId, "2026-08-14", "2026-08-10"),
    ).rejects.toMatchObject({ code: "INVALID_DATE" });
  });

  it("rechaza un rango demasiado largo (>90 días)", async () => {
    const { businessId } = await seedBusiness();
    await expect(
      createClosureRange(businessId, "2026-01-01", "2026-06-01"),
    ).rejects.toMatchObject({ code: "RANGE_TOO_LONG" });
  });
});
