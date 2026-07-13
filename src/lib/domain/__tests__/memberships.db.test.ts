import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAppointment } from "../appointments";
import {
  cancelMembership,
  renewSimulatedMemberships,
  subscribeToPlan,
  validatePlanInput,
} from "@/lib/payments/memberships";
import { resetDb, seedBusiness, seedClient, slotAt } from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");

async function seedPlan(opts?: {
  discountPercent?: number;
  maxAppointmentsPerMonth?: number | null;
}) {
  const { businessId, serviceId } = await seedBusiness({ priceCents: 2000 });
  const plan = await prisma.membershipPlan.create({
    data: {
      businessId,
      name: "Socio",
      priceCents: 1990,
      discountPercent: opts?.discountPercent ?? 25,
      maxAppointmentsPerMonth: opts?.maxAppointmentsPerMonth ?? null,
    },
  });
  const clientId = await seedClient();
  return { businessId, serviceId, plan, clientId };
}

describe("membresías (BD, modo simulado)", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("alta simulada sin claves: fila activa con renovación a 30 días", async () => {
    const { plan, clientId } = await seedPlan();
    const membership = await subscribeToPlan({
      clientId,
      planId: plan.id,
      now: NOW,
    });
    expect(membership.status).toBe("active");
    expect(membership.paymentSimulated).toBe(true);
    expect(membership.stripeSubscriptionId?.startsWith("dev_sub_")).toBe(true);
    expect(membership.currentPeriodEnd?.getTime()).toBe(
      NOW.getTime() + 30 * 86_400_000,
    );

    // Segunda alta en el mismo negocio → 409
    await expect(
      subscribeToPlan({ clientId, planId: plan.id, now: NOW }),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_EXISTS" });
  });

  it("aplica el descuento al reservar y lo referencia en la cita", async () => {
    const { businessId, serviceId, plan, clientId } = await seedPlan({
      discountPercent: 25,
    });
    const membership = await subscribeToPlan({
      clientId,
      planId: plan.id,
      now: NOW,
    });

    const appointment = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-20", "10:00"),
      now: NOW,
    });
    expect(appointment.priceCents).toBe(1500); // 2000 − 25%
    expect(appointment.discountCents).toBe(500);
    expect(appointment.membershipId).toBe(membership.id);

    // Otro cliente sin membresía paga precio completo
    const other = await seedClient();
    const normal = await createAppointment({
      businessId,
      serviceId,
      clientId: other,
      startAt: slotAt("2026-07-20", "11:00"),
      now: NOW,
    });
    expect(normal.priceCents).toBe(2000);
    expect(normal.membershipId).toBeNull();
  });

  it("el cupón tiene prioridad y no se acumula con la membresía", async () => {
    const { businessId, serviceId, plan, clientId } = await seedPlan({
      discountPercent: 25,
    });
    await subscribeToPlan({ clientId, planId: plan.id, now: NOW });
    await prisma.coupon.create({
      data: { businessId, code: "DIEZ", type: "PERCENT", value: 10 },
    });

    const appointment = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-20", "10:00"),
      couponCode: "DIEZ",
      now: NOW,
    });
    // Solo el cupón (10%), no el 25% de la membresía
    expect(appointment.priceCents).toBe(1800);
    expect(appointment.membershipId).toBeNull();
  });

  it("tope mensual: agotado el cupo, la cita sale a precio normal", async () => {
    const { businessId, serviceId, plan, clientId } = await seedPlan({
      discountPercent: 50,
      maxAppointmentsPerMonth: 1,
    });
    await subscribeToPlan({ clientId, planId: plan.id, now: NOW });

    const first = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-20", "10:00"),
      now: NOW,
    });
    expect(first.priceCents).toBe(1000);

    const second = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-21", "10:00"),
      now: NOW,
    });
    expect(second.priceCents).toBe(2000); // sin rechazar, sin descuento
    expect(second.membershipId).toBeNull();

    // Mes siguiente: el cupo se renueva
    const nextMonth = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-08-03", "10:00"),
      now: NOW,
    });
    expect(nextMonth.priceCents).toBe(1000);
  });

  it("past_due no aplica; cancelada con periodo vigente sí", async () => {
    const { businessId, serviceId, plan, clientId } = await seedPlan({
      discountPercent: 25,
    });
    const membership = await subscribeToPlan({
      clientId,
      planId: plan.id,
      now: NOW,
    });

    await prisma.clientMembership.update({
      where: { id: membership.id },
      data: { status: "past_due" },
    });
    const duringPastDue = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-20", "10:00"),
      now: NOW,
    });
    expect(duringPastDue.priceCents).toBe(2000);

    // Cancelada pero con el periodo pagado aún vigente → beneficio se mantiene
    await prisma.clientMembership.update({
      where: { id: membership.id },
      data: { status: "canceled" },
    });
    const duringPaidPeriod = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-21", "10:00"),
      now: NOW,
    });
    expect(duringPaidPeriod.priceCents).toBe(1500);
  });

  it("baja y renovación simulada del cron", async () => {
    const { plan, clientId } = await seedPlan();
    const membership = await subscribeToPlan({
      clientId,
      planId: plan.id,
      now: NOW,
    });

    // Cancelar: beneficio hasta fin de periodo (cancelAtPeriodEnd)
    const cancelled = await cancelMembership({
      clientId,
      membershipId: membership.id,
    });
    expect(cancelled.cancelAtPeriodEnd).toBe(true);
    expect(cancelled.status).toBe("active");

    // Al vencer el periodo, el cron la cierra (no la renueva)
    const afterPeriod = new Date(NOW.getTime() + 31 * 86_400_000);
    const result = await renewSimulatedMemberships(afterPeriod);
    expect(result.ended).toBe(1);
    const final = await prisma.clientMembership.findUniqueOrThrow({
      where: { id: membership.id },
    });
    expect(final.status).toBe("canceled");
  });

  it("renovación simulada: sin baja, el periodo se extiende 30 días", async () => {
    const { plan, clientId } = await seedPlan();
    const membership = await subscribeToPlan({
      clientId,
      planId: plan.id,
      now: NOW,
    });
    const afterPeriod = new Date(NOW.getTime() + 31 * 86_400_000);
    const result = await renewSimulatedMemberships(afterPeriod);
    expect(result.renewed).toBe(1);
    const renewed = await prisma.clientMembership.findUniqueOrThrow({
      where: { id: membership.id },
    });
    expect(renewed.currentPeriodEnd?.getTime()).toBe(
      NOW.getTime() + 60 * 86_400_000,
    );
  });

  it("un plan del 100% exige tope mensual", () => {
    expect(() =>
      validatePlanInput({
        priceCents: 5000,
        discountPercent: 100,
        maxAppointmentsPerMonth: null,
      }),
    ).toThrowError(/tope/);
    expect(() =>
      validatePlanInput({
        priceCents: 5000,
        discountPercent: 100,
        maxAppointmentsPerMonth: 4,
      }),
    ).not.toThrow();
  });
});
