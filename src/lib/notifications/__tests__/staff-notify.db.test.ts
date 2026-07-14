import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb, seedBusiness, seedClient, slotAt } from "@/lib/test/factories";
import { enqueueStaffEventNotification } from "../staff-notify";

async function makeAppointment(opts: {
  withStaff: boolean;
  staffEmail?: string | null;
}) {
  const { businessId, serviceId } = await seedBusiness();
  const clientId = await seedClient();
  let staffId: string | undefined;
  if (opts.withStaff) {
    const staff = await prisma.staffMember.create({
      data: {
        businessId,
        name: "Ana",
        email: opts.staffEmail === undefined ? "ana@test.local" : opts.staffEmail,
        active: true,
      },
    });
    staffId = staff.id;
  }
  const appointment = await prisma.appointment.create({
    data: {
      businessId,
      serviceId,
      clientId,
      staffId,
      startAt: slotAt("2026-08-03", "10:00"),
      endAt: slotAt("2026-08-03", "10:30"),
      priceCents: 1000,
    },
  });
  return { businessId, appointmentId: appointment.id };
}

describe("avisos al staff (BD)", () => {
  beforeEach(resetDb);

  it("avisa por email al empleado asignado en una nueva reserva", async () => {
    const { appointmentId } = await makeAppointment({ withStaff: true });
    await enqueueStaffEventNotification(appointmentId, "STAFF_BOOKING");

    const notifs = await prisma.notification.findMany({
      where: { template: "STAFF_BOOKING" },
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].channel).toBe("EMAIL");
    expect(notifs[0].recipient).toBe("ana@test.local");
    expect(notifs[0].subject).toContain("Nueva reserva");
  });

  it("no encola nada si el negocio desactivó los avisos al equipo", async () => {
    const { businessId, appointmentId } = await makeAppointment({ withStaff: true });
    await prisma.business.update({
      where: { id: businessId },
      data: { notifyStaffEvents: false },
    });
    await enqueueStaffEventNotification(appointmentId, "STAFF_BOOKING");

    expect(await prisma.notification.count()).toBe(0);
  });

  it("sin empleado, avisa al email del negocio (cancelación)", async () => {
    const { businessId, appointmentId } = await makeAppointment({ withStaff: false });
    await prisma.business.update({
      where: { id: businessId },
      data: { email: "negocio@test.local" },
    });
    await enqueueStaffEventNotification(appointmentId, "STAFF_CANCELLED");

    const notifs = await prisma.notification.findMany();
    expect(notifs).toHaveLength(1);
    expect(notifs[0].recipient).toBe("negocio@test.local");
    expect(notifs[0].template).toBe("STAFF_CANCELLED");
    expect(notifs[0].subject).toContain("cancelada");
  });

  it("empleado sin contacto y negocio sin email: no encola (no se pierde silenciosamente en un canal inexistente)", async () => {
    const { appointmentId } = await makeAppointment({
      withStaff: true,
      staffEmail: null,
    });
    await enqueueStaffEventNotification(appointmentId, "STAFF_BOOKING");

    expect(await prisma.notification.count()).toBe(0);
  });
});
