import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAppointment } from "../appointments";
import { notifyWaitlistForFreedSlot } from "../waitlist";
import { resetDb, seedBusiness, seedClient } from "@/lib/test/factories";

const NOW = new Date("2026-07-06T12:00:00.000Z");
const SOON = new Date("2026-07-06T18:00:00.000Z"); // dentro de 24 h
const FAR = new Date("2026-07-12T10:00:00.000Z"); // fuera de la ventana

// Descuento de última hora: se aplica solo a reservas que empiezan en <24 h,
// sin acumularse con cupones ni bonos, y el aviso de lista de espera lo anuncia.
describe("descuento de última hora (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.STRIPE_SECRET_KEY;
  });

  async function seedWithLastMinute(percent = 30) {
    const { businessId, serviceId } = await seedBusiness({ priceCents: 1000 });
    await prisma.business.update({
      where: { id: businessId },
      data: { lastMinuteDiscountPercent: percent },
    });
    const clientId = await seedClient();
    return { businessId, serviceId, clientId };
  }

  it("reserva que empieza en <24 h: se aplica el descuento", async () => {
    const { businessId, serviceId, clientId } = await seedWithLastMinute(30);
    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: SOON,
      now: NOW,
    });
    expect(appt.priceCents).toBe(700);
    expect(appt.discountCents).toBe(300);
  });

  it("reserva lejana: precio íntegro", async () => {
    const { businessId, serviceId, clientId } = await seedWithLastMinute(30);
    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: FAR,
      now: NOW,
    });
    expect(appt.priceCents).toBe(1000);
    expect(appt.discountCents).toBe(0);
  });

  it("no se acumula con cupón: gana el cupón", async () => {
    const { businessId, serviceId, clientId } = await seedWithLastMinute(30);
    await prisma.coupon.create({
      data: {
        businessId,
        code: "DESC10",
        type: "PERCENT",
        value: 10,
        active: true,
      },
    });
    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: SOON,
      couponCode: "DESC10",
      now: NOW,
    });
    // Solo el 10 % del cupón, no 10+30.
    expect(appt.priceCents).toBe(900);
    expect(appt.discountCents).toBe(100);
  });

  it("el aviso de lista de espera anuncia el descuento", async () => {
    const { businessId, serviceId, clientId } = await seedWithLastMinute(25);
    await prisma.waitlistEntry.create({
      data: {
        businessId,
        serviceId,
        clientId,
        desiredDate: "2026-07-06",
        status: "WAITING",
      },
    });
    const { notified } = await notifyWaitlistForFreedSlot({
      businessId,
      serviceId,
      staffId: null,
      desiredDate: "2026-07-06",
      now: NOW,
    });
    expect(notified).toBe(1);
    const notification = await prisma.notification.findFirst({
      where: { businessId, template: "WAITLIST_SLOT_FREED" },
    });
    expect(notification).not.toBeNull();
    // El aviso anuncia el % y el precio exacto ya rebajado
    expect(notification!.body).toContain("25% de descuento");
    expect(notification!.body).toContain("7,50 €");
  });
});
