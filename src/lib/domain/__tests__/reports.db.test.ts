import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  buildOccupancyHeatmap,
  buildRetentionCohorts,
  getPromotionsReport,
  getServiceReport,
  resolveReportRange,
} from "../reports";
import { resetDb, seedBusiness, seedClient, slotAt } from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");

describe("buildRetentionCohorts (puro)", () => {
  it("agrupa por mes de primera visita y cuenta quién repite en 90 días", () => {
    const visits = [
      // Cliente A: primera en enero, repite en febrero (dentro de 90 días)
      { clientId: "a", startAt: new Date("2026-01-10T10:00:00Z") },
      { clientId: "a", startAt: new Date("2026-02-20T10:00:00Z") },
      // Cliente B: primera en enero, no repite
      { clientId: "b", startAt: new Date("2026-01-15T10:00:00Z") },
      // Cliente C: primera en enero, repite... 5 meses después (fuera de ventana)
      { clientId: "c", startAt: new Date("2026-01-05T10:00:00Z") },
      { clientId: "c", startAt: new Date("2026-06-25T10:00:00Z") },
    ];
    const cohorts = buildRetentionCohorts(visits, "UTC", NOW);
    // C reaparece en junio pero como cliente EXISTENTE, no crea cohorte nueva
    expect(cohorts).toHaveLength(1);
    expect(cohorts[0]).toMatchObject({
      month: "2026-01",
      newClients: 3,
      returned: 1,
      retentionPercent: 33,
    });
  });

  it("dos visitas el mismo día no cuentan como retorno (diff 0 días)", () => {
    const day = new Date("2026-03-01T09:00:00Z");
    const cohorts = buildRetentionCohorts(
      [
        { clientId: "a", startAt: day },
        { clientId: "a", startAt: day },
      ],
      "UTC",
      NOW,
    );
    expect(cohorts[0].returned).toBe(0);
  });
});

describe("buildOccupancyHeatmap (puro)", () => {
  it("cuenta citas por día de la semana y hora local del negocio", () => {
    const rows = [
      { startAt: new Date("2026-07-13T10:00:00Z") }, // lunes 10:00 UTC
      { startAt: new Date("2026-07-20T10:30:00Z") }, // lunes 10:30 UTC
      { startAt: new Date("2026-07-14T16:00:00Z") }, // martes 16:00 UTC
    ];
    const { cells, max } = buildOccupancyHeatmap(rows, "UTC");
    expect(max).toBe(2);
    const monday10 = cells.find((c) => c.weekday === 1 && c.hour === 10);
    expect(monday10?.count).toBe(2);
    const tuesday16 = cells.find((c) => c.weekday === 2 && c.hour === 16);
    expect(tuesday16?.count).toBe(1);
  });

  it("aplica la zona horaria (18:00 UTC = 20:00 en Madrid en verano)", () => {
    const { cells } = buildOccupancyHeatmap(
      [{ startAt: new Date("2026-07-13T18:00:00Z") }],
      "Europe/Madrid",
    );
    expect(cells[0]).toMatchObject({ weekday: 1, hour: 20, count: 1 });
  });
});

describe("informes con BD", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("ventas por servicio: totales, no-show y ticket medio del rango", async () => {
    const { businessId, serviceId } = await seedBusiness({ priceCents: 2000 });
    const clientId = await seedClient();
    const mk = (date: string, status: string, chargedCents: number) =>
      prisma.appointment.create({
        data: {
          businessId,
          serviceId,
          clientId,
          startAt: slotAt(date, "10:00"),
          endAt: slotAt(date, "10:30"),
          status,
          priceCents: 2000,
          chargedCents,
        },
      });
    await mk("2026-06-01", "COMPLETED", 2000);
    await mk("2026-06-02", "COMPLETED", 1000); // con descuento
    await mk("2026-06-03", "NO_SHOW", 0);
    await mk("2025-01-01", "COMPLETED", 5000); // fuera de rango

    const range = resolveReportRange("2026-06-01", "2026-06-30", "UTC", NOW);
    const rows = await getServiceReport(businessId, range);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      total: 3,
      completed: 2,
      noShows: 1,
      revenueCents: 3000,
      avgTicketCents: 1500,
      noShowPercent: 33,
    });
  });

  it("promociones: usos de cupón y sesiones consumidas de bonos", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    const coupon = await prisma.coupon.create({
      data: { businessId, code: "PROMO10", type: "PERCENT", value: 10 },
    });
    await prisma.appointment.create({
      data: {
        businessId,
        serviceId,
        clientId,
        startAt: slotAt("2026-06-10", "10:00"),
        endAt: slotAt("2026-06-10", "10:30"),
        status: "COMPLETED",
        priceCents: 900,
        discountCents: 100,
        chargedCents: 900,
        couponId: coupon.id,
      },
    });
    const pack = await prisma.package.create({
      data: {
        businessId,
        serviceId,
        name: "Bono 5",
        sessions: 5,
        priceCents: 4000,
      },
    });
    await prisma.clientPackage.create({
      data: {
        businessId,
        packageId: pack.id,
        clientId,
        remainingSessions: 3, // 2 consumidas
        pricePaidCents: 4000,
        createdAt: slotAt("2026-06-05", "12:00"),
      },
    });

    const range = resolveReportRange("2026-06-01", "2026-06-30", "UTC", NOW);
    const { coupons, packages } = await getPromotionsReport(businessId, range);
    expect(coupons[0]).toMatchObject({
      code: "PROMO10",
      uses: 1,
      discountCents: 100,
      revenueCents: 900,
    });
    expect(packages[0]).toMatchObject({
      name: "Bono 5",
      sold: 1,
      revenueCents: 4000,
      sessionsTotal: 5,
      sessionsUsed: 2,
    });
  });
});
