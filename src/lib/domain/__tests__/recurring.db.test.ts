import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAppointment } from "../appointments";
import {
  cancelSeriesRemainder,
  createRecurringAppointments,
} from "../recurring";
import {
  resetDb,
  seedBusiness,
  seedClient,
  slotAt,
} from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");

// Series recurrentes: misma hora de pared cada N días, ocurrencias en
// conflicto omitidas (no rompen la serie), una sola confirmación inmediata
// y cancelación del resto de la serie sin cargo.
describe("citas recurrentes (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("crea la serie completa con seriesId compartido y una sola confirmación", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();

    const result = await createRecurringAppointments({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-14", "10:00"),
      intervalDays: 7,
      count: 4,
      now: NOW,
    });

    expect(result.created).toHaveLength(4);
    expect(result.skipped).toHaveLength(0);
    const appts = await prisma.appointment.findMany({
      where: { seriesId: result.seriesId },
      orderBy: { startAt: "asc" },
    });
    expect(appts).toHaveLength(4);
    // Mismo martes 10:00 cada semana
    expect(appts.map((a) => a.startAt.toISOString())).toEqual([
      "2026-07-14T10:00:00.000Z",
      "2026-07-21T10:00:00.000Z",
      "2026-07-28T10:00:00.000Z",
      "2026-08-04T10:00:00.000Z",
    ]);

    // Solo la primera ocurrencia manda la confirmación inmediata
    const confirmations = await prisma.notification.findMany({
      where: { businessId, template: "BOOKING_CONFIRMED" },
      select: { appointmentId: true },
    });
    const uniqueAppts = new Set(confirmations.map((n) => n.appointmentId));
    expect(uniqueAppts.size).toBe(1);
    // Los recordatorios sí se programan para todas
    const reminders = await prisma.notification.count({
      where: { businessId, template: "REMINDER" },
    });
    expect(reminders).toBeGreaterThanOrEqual(4);
  });

  it("una ocurrencia en conflicto se omite sin romper la serie", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    const otherClient = await seedClient();

    // Ocupa el hueco de la 2ª ocurrencia (negocio sin equipo → capacidad 1)
    await createAppointment({
      businessId,
      serviceId,
      clientId: otherClient,
      startAt: slotAt("2026-07-21", "10:00"),
      now: NOW,
    });

    const result = await createRecurringAppointments({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-14", "10:00"),
      intervalDays: 7,
      count: 3,
      now: NOW,
    });
    expect(result.created).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].startAt.toISOString()).toBe(
      "2026-07-21T10:00:00.000Z",
    );
  });

  it("cancelar la serie cancela solo las citas futuras confirmadas, sin cargo", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    const admin = await seedClient(); // actor con permisos de negocio

    const result = await createRecurringAppointments({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-14", "10:00"),
      intervalDays: 7,
      count: 3,
      now: NOW,
    });

    // La primera ya pasó (simulado adelantando `now`)
    const later = new Date("2026-07-15T12:00:00.000Z");
    const { cancelled } = await cancelSeriesRemainder({
      businessId,
      seriesId: result.seriesId,
      actorUserId: admin,
      now: later,
    });
    expect(cancelled).toBe(2);

    const appts = await prisma.appointment.findMany({
      where: { seriesId: result.seriesId },
      orderBy: { startAt: "asc" },
    });
    expect(appts[0].status).toBe("CONFIRMED"); // la pasada no se toca
    expect(appts[1].status).toBe("CANCELLED");
    expect(appts[2].status).toBe("CANCELLED");
    expect(appts[1].chargedCents).toBe(0);
  });
});
