import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getPlatformMetrics } from "../platform";
import { resetDb, seedBusiness, seedClient } from "@/lib/test/factories";

const NOW = new Date("2026-07-15T12:00:00.000Z");

describe("getPlatformMetrics (BD)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  // Fija también createdAt (por defecto es la hora real del reloj) para que la
  // serie mensual no dependa de cuándo se ejecute el test.
  async function setPlan(
    businessId: string,
    plan: string,
    status: string,
    active = true,
  ) {
    await prisma.business.update({
      where: { id: businessId },
      data: {
        plan,
        subscriptionStatus: status,
        active,
        createdAt: new Date("2026-07-05T10:00:00.000Z"),
      },
    });
  }

  it("agrega negocios por estado, MRR y volumen de citas", async () => {
    const pro1 = await seedBusiness();
    const pro2 = await seedBusiness();
    const trial = await seedBusiness();
    const pastDue = await seedBusiness();
    const suspended = await seedBusiness();
    await setPlan(pro1.businessId, "pro", "active");
    await setPlan(pro2.businessId, "pro", "active");
    await setPlan(trial.businessId, "pro", "trialing");
    await setPlan(pastDue.businessId, "pro", "past_due");
    await setPlan(suspended.businessId, "free", "canceled", false);

    const client = await seedClient();
    const mkAppt = (bizId: string, svcId: string, createdAt: Date) =>
      prisma.appointment.create({
        data: {
          businessId: bizId,
          serviceId: svcId,
          clientId: client,
          startAt: createdAt,
          endAt: new Date(createdAt.getTime() + 30 * 60_000),
          status: "CONFIRMED",
          priceCents: 0,
          discountCents: 0,
          createdAt,
        },
      });
    // 2 citas este mes (julio) + 1 el mes pasado (junio)
    await mkAppt(pro1.businessId, pro1.serviceId, new Date("2026-07-02T09:00:00Z"));
    await mkAppt(pro1.businessId, pro1.serviceId, new Date("2026-07-10T09:00:00Z"));
    await mkAppt(pro2.businessId, pro2.serviceId, new Date("2026-06-05T09:00:00Z"));

    const m = await getPlatformMetrics(NOW, 6);

    expect(m.totalBusinesses).toBe(5);
    expect(m.activeBusinesses).toBe(4);
    expect(m.suspendedBusinesses).toBe(1);
    expect(m.proActive).toBe(2);
    expect(m.trialing).toBe(1);
    expect(m.pastDue).toBe(1);
    expect(m.mrrCents).toBe(2 * 2900);
    expect(m.totalAppointments).toBe(3);
    expect(m.appointmentsThisMonth).toBe(2);

    // Serie de 6 meses terminando en julio 2026.
    expect(m.appointmentsByMonth).toHaveLength(6);
    const jul = m.appointmentsByMonth.find((x) => x.month === "2026-07")!;
    const jun = m.appointmentsByMonth.find((x) => x.month === "2026-06")!;
    expect(jul.count).toBe(2);
    expect(jun.count).toBe(1);
    // Las 5 altas son de "ahora" (julio) en el sembrado.
    const julNew = m.newBusinessesByMonth.find((x) => x.month === "2026-07")!;
    expect(julNew.count).toBe(5);
  });

  it("plataforma vacía: todo a cero, series de 6 meses", async () => {
    const m = await getPlatformMetrics(NOW, 6);
    expect(m.totalBusinesses).toBe(0);
    expect(m.mrrCents).toBe(0);
    expect(m.totalAppointments).toBe(0);
    expect(m.newBusinessesByMonth).toHaveLength(6);
    expect(m.appointmentsByMonth.every((x) => x.count === 0)).toBe(true);
  });
});
