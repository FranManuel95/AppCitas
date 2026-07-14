import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb, seedBusiness, seedStaff } from "@/lib/test/factories";

// Invariante de aislamiento de la autogestión de ausencias del portal del
// empleado: la ruta /api/personal/time-off acota SIEMPRE por el staffId de la
// sesión (deleteMany where { id, staffId }). Este test fija que ese patrón solo
// toca las ausencias del propio empleado, nunca las de otro.
describe("aislamiento de ausencias propias (BD)", () => {
  beforeEach(resetDb);

  it("el borrado acotado por staffId no toca las ausencias de otro empleado", async () => {
    const { businessId } = await seedBusiness();
    const staffA = await seedStaff(businessId);
    const staffB = await seedStaff(businessId);

    const offB = await prisma.staffTimeOff.create({
      data: { staffId: staffB, startDate: "2026-08-01", endDate: "2026-08-07" },
    });

    // staffA intenta borrar la ausencia de staffB con el patrón de la ruta.
    const cross = await prisma.staffTimeOff.deleteMany({
      where: { id: offB.id, staffId: staffA },
    });
    expect(cross.count).toBe(0);
    expect(
      await prisma.staffTimeOff.findUnique({ where: { id: offB.id } }),
    ).not.toBeNull();

    // El propio dueño (staffB) sí la borra.
    const own = await prisma.staffTimeOff.deleteMany({
      where: { id: offB.id, staffId: staffB },
    });
    expect(own.count).toBe(1);
  });
});
