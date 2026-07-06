import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  cancelAppointment,
  createAppointment,
  setAppointmentStatus,
} from "../appointments";
import { resetDb, seedBusiness, seedClient } from "@/lib/test/factories";

const NOW = new Date("2026-07-06T12:00:00.000Z");
const FUTURE = new Date("2026-07-10T10:00:00.000Z"); // fuera de la ventana de 24 h
const SOON = new Date("2026-07-06T14:00:00.000Z"); // dentro de la ventana (tardía)

// Señal (prepago) al reservar: se cobra en el acto con la tarjeta guardada,
// se devuelve si se cancela en plazo y se descuenta del cargo por tardía o
// no-show. Sin Stripe el proveedor es el simulado (dev).
describe("señal al reservar (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.STRIPE_SECRET_KEY;
  });

  async function seedWithDeposit(opts?: {
    depositPercent?: number;
    feePercent?: number;
    withCard?: boolean | string;
  }) {
    const { businessId, serviceId } = await seedBusiness({ priceCents: 2000 });
    await prisma.business.update({
      where: { id: businessId },
      data: {
        depositPercent: opts?.depositPercent ?? 20,
        lateCancellationFeePercent: opts?.feePercent ?? 50,
      },
    });
    const clientId = await seedClient();
    if (opts?.withCard !== false) {
      await prisma.user.update({
        where: { id: clientId },
        data: {
          stripeCustomerId:
            typeof opts?.withCard === "string" ? opts.withCard : "dev_cus_test",
        },
      });
    }
    return { businessId, serviceId, clientId };
  }

  it("cobra la señal al reservar (SIMULATED en dev)", async () => {
    const { businessId, serviceId, clientId } = await seedWithDeposit();
    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: FUTURE,
      now: NOW,
    });
    expect(appt.depositCents).toBe(400); // 20 % de 2000
    expect(appt.depositStatus).toBe("SIMULATED");
    expect(appt.depositRef).toBeTruthy();

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: appt.id },
    });
    expect(row.depositCents).toBe(400);
    expect(row.depositStatus).toBe("SIMULATED");
  });

  it("sin tarjeta guardada no hay señal, pero la reserva se crea", async () => {
    const { businessId, serviceId, clientId } = await seedWithDeposit({
      withCard: false,
    });
    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: FUTURE,
      now: NOW,
    });
    expect(appt.depositStatus).toBe("NONE");
    expect(appt.depositCents).toBe(0);
  });

  it("tarjeta rechazada: la reserva se deshace por completo (402)", async () => {
    const { businessId, serviceId, clientId } = await seedWithDeposit({
      withCard: "dev_cus_declined_1",
    });
    await expect(
      createAppointment({
        businessId,
        serviceId,
        clientId,
        startAt: FUTURE,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "DEPOSIT_FAILED", httpStatus: 402 });
    // El hueco queda libre: no hay cita residual sin señal.
    expect(await prisma.appointment.count({ where: { businessId } })).toBe(0);
  });

  it("cancelación en plazo: la señal se reembolsa", async () => {
    const { businessId, serviceId, clientId } = await seedWithDeposit();
    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: FUTURE,
      now: NOW,
    });
    const { appointment } = await cancelAppointment({
      appointmentId: appt.id,
      actorUserId: clientId,
      actorIsBusinessAdmin: false,
      now: NOW,
    });
    expect(appointment.status).toBe("CANCELLED");
    expect(appointment.chargedCents).toBe(0);
    expect(appointment.depositStatus).toBe("REFUNDED");
  });

  it("cancelación tardía: la señal se descuenta y se cobra solo el resto", async () => {
    const { businessId, serviceId, clientId } = await seedWithDeposit();
    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: SOON,
      now: NOW,
    });
    const depositRef = appt.depositRef;
    const { appointment } = await cancelAppointment({
      appointmentId: appt.id,
      actorUserId: clientId,
      actorIsBusinessAdmin: false,
      now: NOW,
    });
    expect(appointment.status).toBe("CANCELLED_LATE");
    expect(appointment.chargedCents).toBe(1000); // 50 % de 2000 (cargo total)
    expect(appointment.paymentStatus).toBe("SIMULATED");
    // Hubo un segundo cargo (el resto): la referencia difiere de la señal.
    expect(appointment.paymentRef).not.toBe(depositRef);
    expect(appointment.depositStatus).toBe("SIMULATED"); // la señal no se devuelve
  });

  it("señal que cubre todo el cargo: no se cobra nada más", async () => {
    const { businessId, serviceId, clientId } = await seedWithDeposit({
      depositPercent: 50,
      feePercent: 50,
    });
    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: SOON,
      now: NOW,
    });
    const { appointment } = await cancelAppointment({
      appointmentId: appt.id,
      actorUserId: clientId,
      actorIsBusinessAdmin: false,
      now: NOW,
    });
    expect(appointment.chargedCents).toBe(1000);
    // El cobro es la propia señal: misma referencia, sin cargo adicional.
    expect(appointment.paymentRef).toBe(appt.depositRef);
    expect(appointment.paymentStatus).toBe("SIMULATED");
  });

  it("no-show: la señal se descuenta del cargo", async () => {
    const { businessId, serviceId, clientId } = await seedWithDeposit();
    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: SOON,
      now: NOW,
    });
    const updated = await setAppointmentStatus({
      appointmentId: appt.id,
      businessId,
      status: "NO_SHOW",
      now: new Date("2026-07-06T15:00:00.000Z"),
    });
    expect(updated.chargedCents).toBe(1000); // cargo total registrado
    expect(updated.paymentStatus).toBe("SIMULATED");
    expect(updated.paymentMethod).toBe("CARD_ONLINE");
    // Cobro adicional por la diferencia (600): referencia nueva.
    expect(updated.paymentRef).not.toBe(appt.depositRef);
  });
});
