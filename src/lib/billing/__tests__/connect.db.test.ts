import { beforeEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  getConnectSummary,
  platformFeeCents,
  startConnectOnboarding,
  syncConnectAccount,
} from "../connect";
import { setAppointmentStatus } from "@/lib/domain/appointments";
import { resetDb, seedBusiness, seedClient } from "@/lib/test/factories";

const NOW = new Date("2026-07-05T12:00:00.000Z");

// Cuenta conectada del negocio (Connect). Sin STRIPE_SECRET_KEY el onboarding
// se simula: activa la cuenta en la BD para poder ejercitar el flujo.
describe("Stripe Connect (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.STRIPE_SECRET_KEY; // fuerza el modo simulado
    delete process.env.STRIPE_PLATFORM_FEE_PERCENT;
  });

  it("negocio sin conectar: resumen 'none'", async () => {
    const { businessId } = await seedBusiness();
    const summary = await getConnectSummary(businessId);
    expect(summary).toEqual({
      connected: false,
      chargesEnabled: false,
      status: "none",
    });
  });

  it("onboarding simulado activa la cuenta del negocio", async () => {
    const { businessId } = await seedBusiness();
    const { url } = await startConnectOnboarding({
      businessId,
      ownerEmail: "dueno@negocio.com",
      refreshUrl: "http://x/refresh",
      returnUrl: "http://x/return",
    });
    expect(url).toBe("http://x/return"); // en dev vuelve directo

    const summary = await getConnectSummary(businessId);
    expect(summary.connected).toBe(true);
    expect(summary.chargesEnabled).toBe(true);
    expect(summary.status).toBe("active");

    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { stripeAccountId: true },
    });
    expect(business.stripeAccountId).toMatch(/^dev_acct_/);
  });

  it("syncConnectAccount refleja si la cuenta ya cobra", async () => {
    const { businessId } = await seedBusiness();
    await prisma.business.update({
      where: { id: businessId },
      data: { stripeAccountId: "acct_test", stripeAccountStatus: "pending" },
    });

    await syncConnectAccount({
      id: "acct_test",
      charges_enabled: true,
      details_submitted: true,
    } as Stripe.Account);
    expect((await getConnectSummary(businessId)).status).toBe("active");
    expect((await getConnectSummary(businessId)).chargesEnabled).toBe(true);

    await syncConnectAccount({
      id: "acct_test",
      charges_enabled: false,
      details_submitted: true,
    } as Stripe.Account);
    expect((await getConnectSummary(businessId)).chargesEnabled).toBe(false);
    expect((await getConnectSummary(businessId)).status).toBe("pending");
  });

  it("platformFeeCents: 0 por defecto, porcentual y acotado", () => {
    expect(platformFeeCents(2000)).toBe(0);
    process.env.STRIPE_PLATFORM_FEE_PERCENT = "10";
    expect(platformFeeCents(2000)).toBe(200);
    process.env.STRIPE_PLATFORM_FEE_PERCENT = "150"; // absurdo: se acota al total
    expect(platformFeeCents(2000)).toBe(2000);
  });

  it("no-show en negocio conectado sigue cobrando (SIMULATED en dev)", async () => {
    const { businessId, serviceId } = await seedBusiness({ priceCents: 2000 });
    await prisma.business.update({
      where: { id: businessId },
      data: {
        lateCancellationFeePercent: 50,
        stripeAccountId: "dev_acct_x",
        stripeChargesEnabled: true,
      },
    });
    const clientId = await seedClient();
    await prisma.user.update({
      where: { id: clientId },
      data: { stripeCustomerId: "dev_cus_test" },
    });
    const appt = await prisma.appointment.create({
      data: {
        businessId,
        serviceId,
        clientId,
        startAt: new Date("2026-07-04T10:00:00.000Z"),
        endAt: new Date("2026-07-04T10:30:00.000Z"),
        status: "CONFIRMED",
        priceCents: 2000,
        paymentStatus: "NONE",
      },
    });

    const updated = await setAppointmentStatus({
      appointmentId: appt.id,
      businessId,
      status: "NO_SHOW",
      now: NOW,
    });
    // El enrutado a la cuenta conectada no rompe el cobro simulado en dev.
    expect(updated.chargedCents).toBe(1000);
    expect(updated.paymentStatus).toBe("SIMULATED");
    expect(updated.paymentMethod).toBe("CARD_ONLINE");
  });
});
