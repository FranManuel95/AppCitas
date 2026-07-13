import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAppointment, setAppointmentStatus } from "../appointments";
import { LOYALTY_COUPON_PREFIX, upsertLoyaltyProgram } from "../loyalty";
import { resetDb, seedBusiness, seedClient, slotAt } from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");

async function seedWithProgram(stampsRequired = 2, rewardPercent = 50) {
  const { businessId, serviceId } = await seedBusiness({ priceCents: 2000 });
  await upsertLoyaltyProgram(businessId, {
    active: true,
    stampsRequired,
    rewardPercent,
    rewardValidityDays: 180,
  });
  const clientId = await seedClient();
  return { businessId, serviceId, clientId };
}

async function bookAndComplete(
  businessId: string,
  serviceId: string,
  clientId: string,
  date: string,
  hhmm: string,
) {
  const appointment = await createAppointment({
    businessId,
    serviceId,
    clientId,
    startAt: slotAt(date, hhmm),
    now: NOW,
  });
  await setAppointmentStatus({
    appointmentId: appointment.id,
    businessId,
    status: "COMPLETED",
    now: NOW,
  });
  return appointment;
}

describe("tarjeta de sellos (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("acumula sellos al completar y emite el cupón personal al llenar la tarjeta", async () => {
    const { businessId, serviceId, clientId } = await seedWithProgram(2, 50);

    await bookAndComplete(businessId, serviceId, clientId, "2026-07-14", "10:00");
    let card = await prisma.loyaltyCard.findUniqueOrThrow({
      where: { businessId_clientId: { businessId, clientId } },
    });
    expect(card.stamps).toBe(1);
    expect(card.totalRewards).toBe(0);

    await bookAndComplete(businessId, serviceId, clientId, "2026-07-15", "10:00");
    card = await prisma.loyaltyCard.findUniqueOrThrow({
      where: { businessId_clientId: { businessId, clientId } },
    });
    // Tarjeta llena: sellos consumidos y premio emitido
    expect(card.stamps).toBe(0);
    expect(card.totalStamps).toBe(2);
    expect(card.totalRewards).toBe(1);

    const coupon = await prisma.coupon.findFirstOrThrow({
      where: { businessId, clientId },
    });
    expect(coupon.code.startsWith(LOYALTY_COUPON_PREFIX)).toBe(true);
    expect(coupon.type).toBe("PERCENT");
    expect(coupon.value).toBe(50);
    expect(coupon.maxRedemptions).toBe(1);

    // Aviso del premio encolado en el outbox
    const reward = await prisma.notification.findFirst({
      where: { businessId, template: "LOYALTY_REWARD" },
    });
    expect(reward?.body).toContain(coupon.code);
  });

  it("es idempotente: re-marcar COMPLETED no duplica el sello", async () => {
    const { businessId, serviceId, clientId } = await seedWithProgram(5);
    const appointment = await bookAndComplete(
      businessId,
      serviceId,
      clientId,
      "2026-07-14",
      "10:00",
    );

    // Repite la transición (p. ej. doble click o autocierre + panel)
    await setAppointmentStatus({
      appointmentId: appointment.id,
      businessId,
      status: "COMPLETED",
      now: NOW,
    });
    const card = await prisma.loyaltyCard.findUniqueOrThrow({
      where: { businessId_clientId: { businessId, clientId } },
    });
    expect(card.stamps).toBe(1);
  });

  it("revertir un COMPLETED sellado descuenta el sello", async () => {
    const { businessId, serviceId, clientId } = await seedWithProgram(5);
    const appointment = await bookAndComplete(
      businessId,
      serviceId,
      clientId,
      "2026-07-14",
      "10:00",
    );

    await setAppointmentStatus({
      appointmentId: appointment.id,
      businessId,
      status: "CONFIRMED",
      now: NOW,
    });
    const card = await prisma.loyaltyCard.findUniqueOrThrow({
      where: { businessId_clientId: { businessId, clientId } },
    });
    expect(card.stamps).toBe(0);
    const after = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
      select: { loyaltyStampedAt: true },
    });
    expect(after.loyaltyStampedAt).toBeNull();
  });

  it("sin programa activo no sella nada", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    await bookAndComplete(businessId, serviceId, clientId, "2026-07-14", "10:00");
    const card = await prisma.loyaltyCard.findFirst({ where: { businessId } });
    expect(card).toBeNull();
  });

  it("el cupón personal solo lo canjea su titular", async () => {
    const { businessId, serviceId, clientId } = await seedWithProgram(1 + 1, 50);
    // Genera el premio completando 2 citas
    await bookAndComplete(businessId, serviceId, clientId, "2026-07-14", "10:00");
    await bookAndComplete(businessId, serviceId, clientId, "2026-07-15", "10:00");
    const coupon = await prisma.coupon.findFirstOrThrow({
      where: { businessId, clientId },
    });

    // Otro cliente intenta canjearlo
    const intruder = await seedClient();
    await expect(
      createAppointment({
        businessId,
        serviceId,
        clientId: intruder,
        startAt: slotAt("2026-07-20", "10:00"),
        couponCode: coupon.code,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "COUPON_INVALID" });

    // El titular sí puede, con el descuento aplicado (50% de 20 €)
    const own = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-21", "10:00"),
      couponCode: coupon.code,
      now: NOW,
    });
    expect(own.priceCents).toBe(1000);
    expect(own.discountCents).toBe(1000);
  });
});
