import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAppointment } from "@/lib/domain/appointments";
import { createLocation } from "@/lib/domain/locations";
import {
  resetDb,
  seedBusiness,
  seedClient,
  seedStaff,
  slotAt,
} from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");

// Cablea el override de plantillas de punta a punta: el JSON guardado en
// Business.notificationTemplates debe llegar sustituido a las filas del outbox.
describe("plantillas editables en el outbox (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("la confirmación usa el texto propio y el recordatorio conserva el enlace", async () => {
    const { businessId, serviceId } = await seedBusiness();
    await prisma.business.update({
      where: { id: businessId },
      data: {
        notificationTemplates: JSON.stringify({
          BOOKING_CONFIRMED: {
            subject: "¡Reserva lista, {cliente}!",
            body: "{servicio} el {fecha} a las {hora}.",
          },
          REMINDER: { body: "No olvides tu {servicio} de mañana." },
        }),
      },
    });
    const clientId = await seedClient();

    const appointment = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-15", "10:00"), // a 3 días → recordatorio programado
      now: NOW,
    });

    const confirmed = await prisma.notification.findFirstOrThrow({
      where: { appointmentId: appointment.id, template: "BOOKING_CONFIRMED" },
    });
    expect(confirmed.subject).toContain("¡Reserva lista, Cliente de prueba!");
    expect(confirmed.body).toContain("Servicio el ");
    expect(confirmed.body).toContain("a las 10:00.");

    const reminder = await prisma.notification.findFirstOrThrow({
      where: { appointmentId: appointment.id, template: "REMINDER" },
    });
    expect(reminder.body).toContain("No olvides tu Servicio de mañana.");
    // El texto propio no incluía {enlace}: el enlace de confirmación se añade
    expect(reminder.body).toContain(`/c/${appointment.confirmationToken}`);
  });

  it("la cita con sede lleva la sede en el mensaje de confirmación", async () => {
    const { businessId, serviceId } = await seedBusiness();
    await seedStaff(businessId);
    const centro = await createLocation(businessId, {
      name: "Sede Centro",
      address: "Calle Mayor 1",
    });
    const clientId = await seedClient();

    const appointment = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-15", "10:00"),
      locationId: centro.id,
      now: NOW,
    });

    const confirmed = await prisma.notification.findFirstOrThrow({
      where: { appointmentId: appointment.id, template: "BOOKING_CONFIRMED" },
    });
    expect(confirmed.body).toContain("📍 Sede Centro · Calle Mayor 1");
  });

  it("sin overrides el outbox lleva los textos por defecto", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    const appointment = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-15", "10:00"),
      now: NOW,
    });

    const confirmed = await prisma.notification.findFirstOrThrow({
      where: { appointmentId: appointment.id, template: "BOOKING_CONFIRMED" },
    });
    expect(confirmed.subject).toBe("Cita confirmada en Negocio de prueba");
    expect(confirmed.body).toContain("tu cita está confirmada");
  });
});
