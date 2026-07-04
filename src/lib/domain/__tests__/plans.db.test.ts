import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getPlanUsage } from "../plans";
import { resetDb, seedBusiness, seedClient } from "@/lib/test/factories";

// El cupo mensual del plan se cuenta contra la BD: aquí se comprueba que solo
// suma las citas "vivas" (no las canceladas/no-show) y que la frontera del mes
// respeta la zona horaria del negocio, no UTC.
describe("getPlanUsage — cupo mensual de citas", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function createAppointmentRow(
    businessId: string,
    serviceId: string,
    clientId: string,
    status: string,
    when: { startAt: Date; createdAt?: Date },
  ) {
    await prisma.appointment.create({
      data: {
        businessId,
        serviceId,
        clientId,
        startAt: when.startAt,
        endAt: new Date(when.startAt.getTime() + 30 * 60_000),
        status,
        priceCents: 1000,
        discountCents: 0,
        ...(when.createdAt ? { createdAt: when.createdAt } : {}),
      },
    });
  }

  it("cuenta solo las citas vivas (CONFIRMED/COMPLETED), no las canceladas ni no-show", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    const start = new Date();
    let i = 0;
    for (const status of [
      "CONFIRMED",
      "COMPLETED",
      "CANCELLED",
      "CANCELLED_LATE",
      "NO_SHOW",
    ]) {
      i += 1;
      await createAppointmentRow(businessId, serviceId, clientId, status, {
        startAt: new Date(start.getTime() + i * 3_600_000),
      });
    }

    const usage = await getPlanUsage(businessId);
    // 5 citas creadas este mes, pero solo CONFIRMED + COMPLETED cuentan.
    expect(usage.monthlyAppointments).toBe(2);
  });

  it("usa la frontera de mes de la zona del negocio, no la de UTC", async () => {
    const { businessId, serviceId } = await seedBusiness({
      timezone: "Europe/Madrid",
    });
    const clientId = await seedClient();

    // 2026-06-30 23:00 UTC = 2026-07-01 01:00 en Madrid (verano, UTC+2): es una
    // cita de JULIO en hora local aunque en UTC caiga en junio. La frontera UTC
    // la dejaba fuera; la local la incluye.
    await createAppointmentRow(businessId, serviceId, clientId, "CONFIRMED", {
      startAt: new Date("2026-07-01T09:00:00.000Z"),
      createdAt: new Date("2026-06-30T23:00:00.000Z"),
    });

    const now = new Date("2026-07-15T12:00:00.000Z");
    const usage = await getPlanUsage(businessId, now);
    expect(usage.monthlyAppointments).toBe(1);
  });
});
