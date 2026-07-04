import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb, seedBusiness } from "@/lib/test/factories";

// Se mockea el SDK de Stripe (verificación de firma y recuperación) para probar
// handleStripeWebhook contra la BD: mapeo de estados de suscripción al negocio
// e idempotencia por event.id (no re-aplicar un evento repetido).
const stripeMock = vi.hoisted(() => ({
  event: null as unknown,
  subscription: null as unknown,
}));

vi.mock("stripe", () => ({
  default: class {
    webhooks = { constructEvent: () => stripeMock.event };
    subscriptions = { retrieve: async () => stripeMock.subscription };
  },
}));

import { handleStripeWebhook } from "../index";

const PERIOD_END = 1893456000; // 2030-01-01 en segundos

function subscription(overrides: {
  id: string;
  status: string;
  businessId: string;
}) {
  return {
    id: overrides.id,
    status: overrides.status,
    metadata: { businessId: overrides.businessId },
    customer: "cus_test",
    items: { data: [{ current_period_end: PERIOD_END }] },
  };
}

function subscriptionEvent(eventId: string, sub: unknown) {
  return {
    id: eventId,
    type: "customer.subscription.updated",
    data: { object: sub },
  };
}

describe("handleStripeWebhook (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    stripeMock.event = null;
    stripeMock.subscription = null;
  });

  afterAll(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("suscripción activa → negocio a plan pro/active con renovación", async () => {
    const { businessId } = await seedBusiness();
    const sub = subscription({ id: "sub_1", status: "active", businessId });
    stripeMock.event = subscriptionEvent("evt_active", sub);
    stripeMock.subscription = sub; // el handler re-recupera el estado actual

    await handleStripeWebhook("{}", "sig");

    const biz = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(biz.plan).toBe("pro");
    expect(biz.subscriptionStatus).toBe("active");
    expect(biz.platformStripeSubscriptionId).toBe("sub_1");
    expect(biz.planRenewsAt?.getTime()).toBe(PERIOD_END * 1000);
  });

  it("suscripción cancelada → negocio a plan free/canceled", async () => {
    const { businessId } = await seedBusiness();
    const sub = subscription({ id: "sub_2", status: "canceled", businessId });
    stripeMock.event = subscriptionEvent("evt_canceled", sub);
    stripeMock.subscription = sub;

    await handleStripeWebhook("{}", "sig");

    const biz = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(biz.plan).toBe("free");
    expect(biz.subscriptionStatus).toBe("canceled");
  });

  it("estados de gracia (past_due/unpaid/incomplete) → past_due", async () => {
    const { businessId } = await seedBusiness();
    const sub = subscription({ id: "sub_3", status: "past_due", businessId });
    stripeMock.event = subscriptionEvent("evt_pastdue", sub);
    stripeMock.subscription = sub;

    await handleStripeWebhook("{}", "sig");

    const biz = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(biz.subscriptionStatus).toBe("past_due");
    // Sigue siendo pro mientras no se cancele (periodo de gracia).
    expect(biz.plan).toBe("pro");
  });

  it("es idempotente: el mismo event.id no se re-aplica", async () => {
    const { businessId } = await seedBusiness();
    const sub = subscription({ id: "sub_4", status: "active", businessId });
    stripeMock.event = subscriptionEvent("evt_dup", sub);
    stripeMock.subscription = sub;

    await handleStripeWebhook("{}", "sig");
    // Se altera el negocio a un valor centinela; si el 2º evento re-procesara,
    // lo sobrescribiría a active.
    await prisma.business.update({
      where: { id: businessId },
      data: { subscriptionStatus: "centinela" },
    });

    await handleStripeWebhook("{}", "sig"); // mismo event.id

    const biz = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(biz.subscriptionStatus).toBe("centinela");
    expect(await prisma.processedWebhookEvent.count()).toBe(1);
  });

  it("evento fuera de orden: un `updated` viejo (snapshot active) no re-activa un negocio ya cancelado", async () => {
    const { businessId } = await seedBusiness();
    // El snapshot del evento dice "active" (es un evento anterior que llega
    // tarde), pero el estado REAL de la suscripción en Stripe es "canceled".
    const staleSnapshot = subscription({
      id: "sub_5",
      status: "active",
      businessId,
    });
    const liveState = subscription({
      id: "sub_5",
      status: "canceled",
      businessId,
    });
    stripeMock.event = subscriptionEvent("evt_stale", staleSnapshot);
    stripeMock.subscription = liveState; // lo que devuelve el retrieve

    await handleStripeWebhook("{}", "sig");

    // Se aplica el estado real (canceled/free), no el snapshot desordenado.
    const biz = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(biz.subscriptionStatus).toBe("canceled");
    expect(biz.plan).toBe("free");
  });
});
