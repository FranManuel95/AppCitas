import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAppointment, getAvailability } from "../appointments";
import {
  resetDb,
  seedBusiness,
  seedClient,
  seedStaff,
  slotAt,
} from "@/lib/test/factories";

const DATE = "2020-01-06"; // lunes
const NOW = slotAt(DATE, "08:00");

describe("override de duración/precio por empleado (BD)", () => {
  beforeEach(resetDb);

  it("la reserva con un empleado con override usa su duración y precio", async () => {
    const { businessId, serviceId } = await seedBusiness({
      durationMinutes: 30,
      priceCents: 1000,
    });
    const clientId = await seedClient();
    const staffId = await seedStaff(businessId, { serviceIds: [serviceId] });
    await prisma.staffService.update({
      where: { staffId_serviceId: { staffId, serviceId } },
      data: { durationMinutes: 45, priceCents: 1500 },
    });

    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      staffId,
      startAt: slotAt(DATE, "10:00"),
      now: NOW,
    });

    expect(appt.priceCents).toBe(1500);
    expect(appt.endAt.getTime() - appt.startAt.getTime()).toBe(45 * 60_000);
  });

  it("sin override usa la base del servicio", async () => {
    const { businessId, serviceId } = await seedBusiness({
      durationMinutes: 30,
      priceCents: 1000,
    });
    const clientId = await seedClient();
    const staffId = await seedStaff(businessId, { serviceIds: [serviceId] });

    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      staffId,
      startAt: slotAt(DATE, "10:00"),
      now: NOW,
    });

    expect(appt.priceCents).toBe(1000);
    expect(appt.endAt.getTime() - appt.startAt.getTime()).toBe(30 * 60_000);
  });

  it("la disponibilidad para ese empleado genera huecos con su duración override", async () => {
    const { businessId, serviceId } = await seedBusiness({
      durationMinutes: 30,
      priceCents: 1000,
    });
    const staffId = await seedStaff(businessId, { serviceIds: [serviceId] });
    await prisma.staffService.update({
      where: { staffId_serviceId: { staffId, serviceId } },
      data: { durationMinutes: 45 },
    });

    const slots = await getAvailability({
      businessId,
      serviceId,
      dateISO: DATE,
      staffId,
      now: NOW,
    });

    expect(slots.length).toBeGreaterThan(0);
    const first = slots[0];
    expect(first.end.getTime() - first.start.getTime()).toBe(45 * 60_000);
  });
});
