import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { setAppointmentStatus } from "../appointments";
import { resetDb, seedBusiness, seedClient } from "@/lib/test/factories";

const NOW = new Date("2026-07-05T12:00:00.000Z");

// Blinda el cálculo del cargo y el cobro (simulado) al registrar el estado
// operativo de una cita. Sin Stripe configurado el proveedor de pagos es el
// simulado (dev), así que se puede ejercitar el flujo completo.
describe("setAppointmentStatus (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.STRIPE_SECRET_KEY; // fuerza el proveedor de pagos dev
  });

  async function makeAppointment(overrides: Record<string, unknown> = {}) {
    const { businessId, serviceId } = await seedBusiness({ priceCents: 2000 });
    // Comisión del 50 % para distinguir el cargo del precio completo.
    await prisma.business.update({
      where: { id: businessId },
      data: { lateCancellationFeePercent: 50 },
    });
    const clientId = await seedClient();
    const appt = await prisma.appointment.create({
      data: {
        businessId,
        serviceId,
        clientId,
        startAt: new Date("2026-07-04T10:00:00.000Z"),
        endAt: new Date("2026-07-04T10:30:00.000Z"),
        status: "CONFIRMED",
        priceCents: 2000,
        chargedCents: 0,
        discountCents: 0,
        paymentStatus: "NONE",
        ...overrides,
      },
    });
    return { businessId, serviceId, clientId, appt };
  }

  it("COMPLETED registra el precio como cobrado (efectivo por defecto)", async () => {
    const { appt, businessId } = await makeAppointment();
    const updated = await setAppointmentStatus({
      appointmentId: appt.id,
      businessId,
      status: "COMPLETED",
      now: NOW,
    });
    expect(updated.status).toBe("COMPLETED");
    expect(updated.chargedCents).toBe(2000);
    // Sin indicar método, se asume cobro en efectivo.
    expect(updated.paymentMethod).toBe("CASH");
  });

  it("COMPLETED con tarjeta física registra CARD_TERMINAL", async () => {
    const { appt, businessId } = await makeAppointment();
    const updated = await setAppointmentStatus({
      appointmentId: appt.id,
      businessId,
      status: "COMPLETED",
      paymentMethod: "CARD_TERMINAL",
      now: NOW,
    });
    expect(updated.chargedCents).toBe(2000);
    expect(updated.paymentMethod).toBe("CARD_TERMINAL");
  });

  it("NO_SHOW sin tarjeta: aplica la comisión (UNCOLLECTED) y avisa al cliente", async () => {
    const { appt, businessId } = await makeAppointment();
    const updated = await setAppointmentStatus({
      appointmentId: appt.id,
      businessId,
      status: "NO_SHOW",
      now: NOW,
    });
    expect(updated.status).toBe("NO_SHOW");
    expect(updated.chargedCents).toBe(1000); // 50 % de 2000
    expect(updated.paymentStatus).toBe("UNCOLLECTED");
    // Sin cobro online no se registra forma de pago (lo gestiona el negocio).
    expect(updated.paymentMethod).toBeNull();

    // Antes se cobraba en silencio; ahora hay aviso de no-show.
    const notif = await prisma.notification.findFirst({
      where: { appointmentId: appt.id, template: "NO_SHOW" },
    });
    expect(notif).not.toBeNull();
    expect(notif!.subject).toContain("No presentado");
  });

  it("NO_SHOW con tarjeta guardada: cobra (SIMULATED en dev)", async () => {
    const { appt, businessId, clientId } = await makeAppointment();
    await prisma.user.update({
      where: { id: clientId },
      data: { stripeCustomerId: "dev_cus_test" },
    });
    const updated = await setAppointmentStatus({
      appointmentId: appt.id,
      businessId,
      status: "NO_SHOW",
      now: NOW,
    });
    expect(updated.chargedCents).toBe(1000);
    expect(updated.paymentStatus).toBe("SIMULATED");
    // El cobro online del no-show queda marcado como tarjeta (online).
    expect(updated.paymentMethod).toBe("CARD_ONLINE");
  });

  it("CANCELLED no cobra y marca cancelledAt", async () => {
    const { appt, businessId } = await makeAppointment();
    const updated = await setAppointmentStatus({
      appointmentId: appt.id,
      businessId,
      status: "CANCELLED",
      now: NOW,
    });
    expect(updated.chargedCents).toBe(0);
    expect(updated.cancelledAt).not.toBeNull();
  });

  it("revertir a CONFIRMED limpia cargo, estado de pago, método y cancelación", async () => {
    const { appt, businessId } = await makeAppointment({
      status: "NO_SHOW",
      chargedCents: 1000,
      paymentStatus: "SIMULATED",
      paymentMethod: "CARD_ONLINE",
    });
    const updated = await setAppointmentStatus({
      appointmentId: appt.id,
      businessId,
      status: "CONFIRMED",
      now: NOW,
    });
    expect(updated.chargedCents).toBe(0);
    expect(updated.paymentStatus).toBe("NONE");
    expect(updated.paymentMethod).toBeNull();
    expect(updated.cancelledAt).toBeNull();
  });

  it("aísla: no permite tocar una cita de otro negocio", async () => {
    const { appt } = await makeAppointment();
    const other = await seedBusiness();
    await expect(
      setAppointmentStatus({
        appointmentId: appt.id,
        businessId: other.businessId,
        status: "COMPLETED",
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "APPOINTMENT_NOT_FOUND" });
  });
});
