import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createAppointment,
  getAvailability,
  getPublicAvailability,
} from "../appointments";
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

  it("una cita que cruza medianoche sigue bloqueando el día siguiente (cota inferior)", async () => {
    const { businessId, serviceId } = await seedBusiness({
      durationMinutes: 60,
    });
    const clientId = await seedClient();
    // Cita 23:30–00:30 sembrada a mano (cruza al día 2020-01-07)
    await prisma.appointment.create({
      data: {
        businessId,
        serviceId,
        clientId,
        startAt: slotAt(DATE, "23:30"),
        endAt: new Date(slotAt(DATE, "23:30").getTime() + 60 * 60_000),
        status: "CONFIRMED",
        priceCents: 1000,
      },
    });

    const slots = await getAvailability({
      businessId,
      serviceId,
      dateISO: "2020-01-07",
      now: NOW,
    });
    const starts = slots.map((s) => s.start.toISOString());
    // 00:00 del día siguiente choca con la cita que viene de la víspera
    expect(starts).not.toContain("2020-01-07T00:00:00.000Z");
    expect(starts).toContain("2020-01-07T01:00:00.000Z");

    // Y la reserva directa de ese hueco también se rechaza
    await expect(
      createAppointment({
        businessId,
        serviceId,
        clientId,
        startAt: slotAt("2020-01-07", "00:00"),
        now: NOW,
      }),
    ).rejects.toMatchObject({ httpStatus: 409 });
  });

  it("getPublicAvailability resuelve el negocio por slug en una sola pasada", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { slug: true },
    });

    const result = await getPublicAvailability({
      slug: business.slug,
      serviceId,
      dateISO: DATE,
      now: NOW,
    });
    expect(result.businessId).toBe(businessId);
    expect(result.timezone).toBe("UTC");
    expect(result.slots.length).toBeGreaterThan(0);

    await expect(
      getPublicAvailability({
        slug: "no-existe",
        serviceId,
        dateISO: DATE,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "BUSINESS_NOT_FOUND" });
  });

  it("los buffers del servicio bloquean el hueco contiguo a una cita existente", async () => {
    const { businessId, serviceId } = await seedBusiness({
      durationMinutes: 60,
    });
    const clientId = await seedClient();

    // Cita existente 10:00–11:00
    await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt(DATE, "10:00"),
      now: NOW,
    });

    // Sin buffer, el hueco pegado (11:00) se reserva sin problema…
    const contiguous = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt(DATE, "11:00"),
      now: NOW,
    });
    await prisma.appointment.delete({ where: { id: contiguous.id } });

    // …con buffer after de 30 min en el servicio, deja de ofertarse
    await prisma.service.update({
      where: { id: serviceId },
      data: { bufferAfterMinutes: 30 },
    });
    await expect(
      createAppointment({
        businessId,
        serviceId,
        clientId,
        startAt: slotAt(DATE, "11:00"),
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

    // El hueco a las 12:00 (fuera del margen) sigue disponible
    const after = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt(DATE, "12:00"),
      now: NOW,
    });
    expect(after.status).toBe("CONFIRMED");
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
