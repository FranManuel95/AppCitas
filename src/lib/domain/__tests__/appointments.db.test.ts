import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAppointment } from "../appointments";
import {
  resetDb,
  seedBusiness,
  seedClient,
  slotAt,
} from "@/lib/test/factories";

// Tests con BD real (SQLite temporal) de createAppointment: cubren la reserva
// transaccional, el rechazo por solapamiento y el consumo atómico de cupón/bono
// (las zonas donde hay dinero), que los tests puros de disponibilidad no tocan.

const DATE = "2020-01-06"; // lunes
const NOW = slotAt(DATE, "08:00");

describe("createAppointment (BD)", () => {
  beforeEach(resetDb);

  it("reserva un hueco libre y persiste la cita CONFIRMED", async () => {
    const { businessId, serviceId } = await seedBusiness({ priceCents: 1000 });
    const clientId = await seedClient();

    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt(DATE, "10:00"),
      now: NOW,
    });

    expect(appt.status).toBe("CONFIRMED");
    expect(appt.priceCents).toBe(1000);
    expect(await prisma.appointment.count()).toBe(1);
  });

  it("rechaza con 409 una segunda reserva del mismo hueco (sin equipo, aforo 1)", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    const startAt = slotAt(DATE, "10:00");

    await createAppointment({ businessId, serviceId, clientId, startAt, now: NOW });

    // Secuencialmente el motor de disponibilidad ya no oferta el hueco ocupado
    // (SLOT_UNAVAILABLE); el chequeo en transacción (SLOT_TAKEN) es la red para
    // la carrera concurrente. Ambos son 409 y ambos dejan una sola cita.
    await expect(
      createAppointment({ businessId, serviceId, clientId, startAt, now: NOW }),
    ).rejects.toMatchObject({ httpStatus: 409 });
    expect(await prisma.appointment.count()).toBe(1);
  });

  it("aplica un cupón PERCENT y cuenta el canje de forma atómica con la reserva", async () => {
    const { businessId, serviceId } = await seedBusiness({ priceCents: 1000 });
    const clientId = await seedClient();
    const coupon = await prisma.coupon.create({
      data: { businessId, code: "PROMO20", type: "PERCENT", value: 20 },
    });

    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt(DATE, "10:00"),
      couponCode: "promo20", // se normaliza a mayúsculas
      now: NOW,
    });

    expect(appt.discountCents).toBe(200);
    expect(appt.priceCents).toBe(800);
    expect(appt.couponId).toBe(coupon.id);
    const refreshed = await prisma.coupon.findUniqueOrThrow({
      where: { id: coupon.id },
    });
    expect(refreshed.timesRedeemed).toBe(1);
  });

  it("consume una sesión del bono y deja la cita a 0 €", async () => {
    const { businessId, serviceId } = await seedBusiness({ priceCents: 1000 });
    const clientId = await seedClient();
    const pkg = await prisma.package.create({
      data: {
        businessId,
        serviceId,
        name: "Bono 5",
        sessions: 5,
        priceCents: 4000,
      },
    });
    const clientPackage = await prisma.clientPackage.create({
      data: {
        businessId,
        packageId: pkg.id,
        clientId,
        remainingSessions: 5,
        pricePaidCents: 4000,
      },
    });

    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt(DATE, "10:00"),
      clientPackageId: clientPackage.id,
      now: NOW,
    });

    expect(appt.priceCents).toBe(0);
    expect(appt.discountCents).toBe(1000);
    expect(appt.clientPackageId).toBe(clientPackage.id);
    const refreshed = await prisma.clientPackage.findUniqueOrThrow({
      where: { id: clientPackage.id },
    });
    expect(refreshed.remainingSessions).toBe(4);
  });
});
