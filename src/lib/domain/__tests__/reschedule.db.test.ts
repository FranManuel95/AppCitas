import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAppointment, rescheduleAppointment } from "../appointments";
import {
  resetDb,
  seedBusiness,
  seedClient,
  seedStaff,
  slotAt,
} from "@/lib/test/factories";

const DATE = "2020-01-06"; // lunes
const NOW = slotAt(DATE, "08:00");

// rescheduleAppointment con efectos reales en BD (duración por empleado,
// anulación de avisos pendientes). Las reglas puras de quién puede
// reprogramar y cuándo están en reschedule.test.ts.
describe("reprogramación (BD)", () => {
  beforeEach(resetDb);

  it("conserva la duración override del empleado y no deja hueco fantasma", async () => {
    const { businessId, serviceId } = await seedBusiness({
      durationMinutes: 30,
      priceCents: 1000,
    });
    // Granularidad 30': con la base de 30' y el override de 45', las 12:30
    // serían el hueco fantasma si la reprogramación encogiera la cita.
    await prisma.business.update({
      where: { id: businessId },
      data: { slotGranularityMinutes: 30 },
    });
    const clientId = await seedClient();
    const staffId = await seedStaff(businessId, { serviceIds: [serviceId] });
    await prisma.staffService.update({
      where: { staffId_serviceId: { staffId, serviceId } },
      data: { durationMinutes: 45 },
    });

    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      staffId,
      startAt: slotAt(DATE, "10:00"),
      now: NOW,
    });
    expect(appt.endAt.getTime() - appt.startAt.getTime()).toBe(45 * 60_000);

    const moved = await rescheduleAppointment({
      appointmentId: appt.id,
      actorUserId: "admin-user",
      actorIsBusinessAdmin: true,
      newStartAt: slotAt(DATE, "12:00"),
      now: NOW,
    });
    // Sin el override la cita quedaría en 30' (12:00–12:30)…
    expect(moved.endAt.getTime() - moved.startAt.getTime()).toBe(45 * 60_000);

    // …y las 12:30 serían reservables por "cualquiera" → solape real con el
    // único profesional, ocupado hasta las 12:45.
    const other = await seedClient();
    await expect(
      createAppointment({
        businessId,
        serviceId,
        clientId: other,
        startAt: slotAt(DATE, "12:30"),
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });

  it("anula la confirmación antigua aún PENDING (evita el doble aviso)", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt(DATE, "10:00"),
      now: NOW,
    });

    // El drenado inline de la reserva puede haberla procesado ya: se repone a
    // PENDING para simular un outbox sin drenar en el momento de mover.
    const confirm = await prisma.notification.findFirstOrThrow({
      where: { appointmentId: appt.id, template: "BOOKING_CONFIRMED" },
    });
    await prisma.notification.update({
      where: { id: confirm.id },
      data: { status: "PENDING" },
    });

    await rescheduleAppointment({
      appointmentId: appt.id,
      actorUserId: "admin-user",
      actorIsBusinessAdmin: true,
      newStartAt: slotAt(DATE, "12:00"),
      now: NOW,
    });

    // La confirmación antigua (hora vieja) queda anulada; la reprogramación
    // encola la suya propia con la hora nueva.
    const old = await prisma.notification.findUniqueOrThrow({
      where: { id: confirm.id },
    });
    expect(old.status).toBe("SKIPPED");
    expect(old.lastError).toBe("Cita reprogramada");
    const fresh = await prisma.notification.findFirst({
      where: {
        appointmentId: appt.id,
        template: "BOOKING_CONFIRMED",
        id: { not: confirm.id },
      },
    });
    expect(fresh).not.toBeNull();
  });
});
