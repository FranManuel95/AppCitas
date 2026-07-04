import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getDashboardStats } from "../stats";
import { resetDb, seedBusiness, seedClient } from "@/lib/test/factories";

// Paridad del dashboard tras pasar los agregados a la BD (groupBy/count/sum):
// mismos números que calculaba la versión en JS sobre todas las filas.
const NOW = new Date("2026-07-15T12:00:00.000Z"); // mes actual: 2026-07 (tz UTC)

describe("getDashboardStats (BD, agregados)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function createAppointment(opts: {
    businessId: string;
    serviceId: string;
    clientId: string;
    status: string;
    startAt: Date;
    chargedCents?: number;
    durationMinutes?: number;
  }) {
    const minutes = opts.durationMinutes ?? 60;
    await prisma.appointment.create({
      data: {
        businessId: opts.businessId,
        serviceId: opts.serviceId,
        clientId: opts.clientId,
        startAt: opts.startAt,
        endAt: new Date(opts.startAt.getTime() + minutes * 60_000),
        status: opts.status,
        priceCents: opts.chargedCents ?? 0,
        chargedCents: opts.chargedCents ?? 0,
        discountCents: 0,
      },
    });
  }

  it("calcula serie mensual, agregados del mes, top servicios y clientes únicos", async () => {
    const { businessId, serviceId: svcA } = await seedBusiness();
    const svcB = (
      await prisma.service.create({
        data: {
          businessId,
          name: "Servicio B",
          durationMinutes: 60,
          priceCents: 2000,
          active: true,
        },
      })
    ).id;
    const client1 = await seedClient();
    const client2 = await seedClient();

    // Mes actual (2026-07): completada, cancelación tardía y una futura confirmada
    await createAppointment({
      businessId, serviceId: svcA, clientId: client1,
      status: "COMPLETED", startAt: new Date("2026-07-10T10:00:00.000Z"),
      chargedCents: 1000,
    });
    await createAppointment({
      businessId, serviceId: svcA, clientId: client2,
      status: "CANCELLED_LATE", startAt: new Date("2026-07-12T10:00:00.000Z"),
      chargedCents: 500,
    });
    await createAppointment({
      businessId, serviceId: svcB, clientId: client1,
      status: "CONFIRMED", startAt: new Date("2026-07-20T10:00:00.000Z"),
      chargedCents: 0,
    });
    // Mes anterior (2026-06)
    await createAppointment({
      businessId, serviceId: svcB, clientId: client1,
      status: "COMPLETED", startAt: new Date("2026-06-05T10:00:00.000Z"),
      chargedCents: 2000,
    });
    // Fuera de la ventana de 12 meses (2025-06): no debe contar
    await createAppointment({
      businessId, serviceId: svcA, clientId: client1,
      status: "COMPLETED", startAt: new Date("2025-06-01T10:00:00.000Z"),
      chargedCents: 9999,
    });
    // Venta de un bono este mes: suma al ingreso del mes
    const pkg = await prisma.package.create({
      data: {
        businessId, serviceId: svcA, name: "Bono 5",
        sessions: 5, priceCents: 3000, active: true,
      },
    });
    await prisma.clientPackage.create({
      data: {
        businessId, packageId: pkg.id, clientId: client2,
        remainingSessions: 5, pricePaidCents: 3000,
        createdAt: new Date("2026-07-03T09:00:00.000Z"),
      },
    });

    const stats = await getDashboardStats(businessId, NOW);

    // Agregados del mes actual
    expect(stats.monthAppointments).toBe(3);
    expect(stats.monthRevenueCents).toBe(1000 + 500 + 3000);
    expect(stats.monthLateCancellations).toBe(1);
    expect(stats.monthLateChargesCents).toBe(500);
    expect(stats.upcomingConfirmed).toBe(1);
    expect(stats.uniqueClients).toBe(2);

    // Serie mensual: 12 puntos, con julio y junio poblados
    expect(stats.monthly).toHaveLength(12);
    const july = stats.monthly.find((p) => p.month === "2026-07")!;
    expect(july.total).toBe(3);
    expect(july.completed).toBe(1);
    expect(july.cancelledLate).toBe(1);
    expect(july.revenueCents).toBe(1000 + 500 + 3000);
    expect(july.packageRevenueCents).toBe(3000);
    const june = stats.monthly.find((p) => p.month === "2026-06")!;
    expect(june.total).toBe(1);
    expect(june.completed).toBe(1);
    expect(june.revenueCents).toBe(2000);

    // Top servicios por ingreso: B (2000) por delante de A (1500); la cita de
    // 2025 queda fuera de la ventana
    expect(stats.topServices[0]).toMatchObject({
      serviceId: svcB,
      count: 2,
      revenueCents: 2000,
    });
    expect(stats.topServices[1]).toMatchObject({
      serviceId: svcA,
      count: 2,
      revenueCents: 1500,
    });

    // Desglose por estado dentro de la ventana (la de 2025 no cuenta)
    const byStatus = Object.fromEntries(
      stats.statusBreakdown.map((s) => [s.status, s.count]),
    );
    expect(byStatus).toEqual({ COMPLETED: 2, CANCELLED_LATE: 1, CONFIRMED: 1 });

    expect(stats.occupancyPercent).toBeGreaterThanOrEqual(0);
    expect(stats.occupancyPercent).toBeLessThanOrEqual(100);
  });

  it("negocio sin citas: todo a cero sin fallar", async () => {
    const { businessId } = await seedBusiness();
    const stats = await getDashboardStats(businessId, NOW);
    expect(stats.monthAppointments).toBe(0);
    expect(stats.monthRevenueCents).toBe(0);
    expect(stats.uniqueClients).toBe(0);
    expect(stats.topServices).toEqual([]);
    expect(stats.statusBreakdown).toEqual([]);
    expect(stats.monthly).toHaveLength(12);
  });
});
