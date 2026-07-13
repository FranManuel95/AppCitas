import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAppointment } from "../appointments";
import {
  isBirthdayUpcoming,
  resolveSegment,
} from "../campaigns";
import {
  createRecurringAppointments,
  rescheduleSeriesRemainder,
} from "../recurring";
import { resetDb, seedBusiness, seedClient, slotAt } from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");

describe("mover serie entera (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("desplaza las citas futuras el mismo delta con la nueva hora de pared", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    const admin = await seedClient();
    const series = await createRecurringAppointments({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-14", "10:00"), // martes 10:00, semanal ×3
      intervalDays: 7,
      count: 3,
      now: NOW,
    });

    // Mover la primera al miércoles 15 a las 16:00 → +1 día y nueva hora
    const result = await rescheduleSeriesRemainder({
      businessId,
      seriesId: series.seriesId,
      actorUserId: admin,
      newStartAt: slotAt("2026-07-15", "16:00"),
      now: NOW,
    });
    expect(result.moved).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);

    const appts = await prisma.appointment.findMany({
      where: { seriesId: series.seriesId, status: "CONFIRMED" },
      orderBy: { startAt: "asc" },
    });
    expect(appts.map((a) => a.startAt.toISOString())).toEqual([
      "2026-07-15T16:00:00.000Z",
      "2026-07-22T16:00:00.000Z",
      "2026-07-29T16:00:00.000Z",
    ]);
  });

  it("los huecos en conflicto se omiten sin romper el resto", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    const otherClient = await seedClient();
    const admin = await seedClient();
    const series = await createRecurringAppointments({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-14", "10:00"),
      intervalDays: 7,
      count: 2,
      now: NOW,
    });
    // Ocupa el destino de la 2ª ocurrencia (capacidad 1, negocio sin equipo)
    await createAppointment({
      businessId,
      serviceId,
      clientId: otherClient,
      startAt: slotAt("2026-07-22", "16:00"),
      now: NOW,
    });

    const result = await rescheduleSeriesRemainder({
      businessId,
      seriesId: series.seriesId,
      actorUserId: admin,
      newStartAt: slotAt("2026-07-15", "16:00"),
      now: NOW,
    });
    expect(result.moved).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].code).toBe("SLOT_TAKEN");
  });
});

describe("segmento de cumpleaños", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("isBirthdayUpcoming: dentro de 30 días, cruce de año incluido", () => {
    const now = new Date("2026-07-12T12:00:00.000Z");
    expect(isBirthdayUpcoming(new Date("1990-07-20"), now)).toBe(true); // en 8 días
    expect(isBirthdayUpcoming(new Date("1990-07-12"), now)).toBe(true); // hoy
    expect(isBirthdayUpcoming(new Date("1990-09-01"), now)).toBe(false); // en 51 días
    expect(isBirthdayUpcoming(new Date("1990-07-01"), now)).toBe(false); // ya pasó
    // Cruce de año: a 28 de diciembre, un cumpleaños el 5 de enero entra
    const yearEnd = new Date("2026-12-28T12:00:00.000Z");
    expect(isBirthdayUpcoming(new Date("1985-01-05"), yearEnd)).toBe(true);
  });

  it("resolveSegment BIRTHDAY: solo clientes con cumpleaños próximo", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const soon = await seedClient();
    const far = await seedClient();
    const noBirthday = await seedClient();
    await prisma.user.update({
      where: { id: soon },
      data: { birthDate: new Date("1992-07-25T00:00:00.000Z") },
    });
    await prisma.user.update({
      where: { id: far },
      data: { birthDate: new Date("1992-01-15T00:00:00.000Z") },
    });
    // Todos son "cartera" (tienen alguna cita)
    for (const [i, clientId] of [soon, far, noBirthday].entries()) {
      await createAppointment({
        businessId,
        serviceId,
        clientId,
        startAt: slotAt("2026-07-14", `${10 + i}:00`),
        now: NOW,
      });
    }

    const recipients = await resolveSegment(businessId, "BIRTHDAY", NOW);
    expect(recipients.map((r) => r.clientId)).toEqual([soon]);
  });
});
