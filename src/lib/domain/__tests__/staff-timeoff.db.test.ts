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

const NOW = new Date("2026-07-12T12:00:00.000Z");

// Ausencias por empleado: el día ausente no ofrece huecos ni recibe citas
// (tampoco por asignación automática), y el resto de días no se ve afectado.
describe("ausencias por empleado (BD)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("el empleado ausente no ofrece huecos ese día (y sí los demás)", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const staffId = await seedStaff(businessId);
    await prisma.staffTimeOff.create({
      data: { staffId, startDate: "2026-07-20", endDate: "2026-07-21" },
    });

    const absentDay = await getAvailability({
      businessId,
      serviceId,
      dateISO: "2026-07-20",
      staffId,
      now: NOW,
    });
    expect(absentDay).toHaveLength(0);

    const backDay = await getAvailability({
      businessId,
      serviceId,
      dateISO: "2026-07-22",
      staffId,
      now: NOW,
    });
    expect(backDay.length).toBeGreaterThan(0);
  });

  it("la asignación automática evita al ausente y usa al compañero", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const absentId = await seedStaff(businessId);
    const availableId = await seedStaff(businessId);
    await prisma.staffTimeOff.create({
      data: { staffId: absentId, startDate: "2026-07-20", endDate: "2026-07-20" },
    });
    const clientId = await seedClient();

    // Sin staffId: el motor debe asignar SIEMPRE al que no está ausente
    const slots = await getAvailability({
      businessId,
      serviceId,
      dateISO: "2026-07-20",
      now: NOW,
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => !s.staffIds.includes(absentId))).toBe(true);

    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-20", "10:00"),
      now: NOW,
    });
    expect(appt.staffId).toBe(availableId);
  });

  it("reservar explícitamente con el ausente se rechaza", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const staffId = await seedStaff(businessId);
    await prisma.staffTimeOff.create({
      data: { staffId, startDate: "2026-07-20", endDate: "2026-07-20" },
    });
    const clientId = await seedClient();

    await expect(
      createAppointment({
        businessId,
        serviceId,
        clientId,
        startAt: slotAt("2026-07-20", "10:00"),
        staffId,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });
});
