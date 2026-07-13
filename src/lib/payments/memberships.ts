import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/domain/errors";
import { logError } from "@/lib/logger";

// Membresías de clientes: cuota mensual a cambio de un % de descuento en las
// citas del negocio. La suscripción vive en la PLATAFORMA (la tarjeta guardada
// del cliente, User.stripeCustomerId, es de la plataforma) y el dinero viaja a
// la cuenta conectada del negocio como destination charge
// (transfer_data.destination + application_fee_percent), igual que los cobros
// B2C de cancelaciones.
//
// Sin STRIPE_SECRET_KEY todo se simula en desarrollo (patrón billing/payments):
// fila activa, renovación a 30 días, id dev_sub_*. La simulación se bloquea en
// producción.

let client: Stripe | null = null;

function stripe(): Stripe {
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return client;
}

function isConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

function assertSimulationAllowed(): void {
  if (process.env.NODE_ENV === "production") {
    throw new DomainError(
      "Los pagos no están configurados en este entorno",
      "PAYMENTS_NOT_CONFIGURED",
      503,
    );
  }
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Estados que bloquean un alta nueva en el mismo negocio
const LIVE_STATUSES = ["active", "past_due"];

/** Valida los campos de un plan (creación y edición). */
export function validatePlanInput(input: {
  priceCents: number;
  discountPercent: number;
  maxAppointmentsPerMonth: number | null;
}): void {
  if (input.discountPercent < 1 || input.discountPercent > 100) {
    throw new DomainError(
      "El descuento debe estar entre 1 y 100%",
      "MEMBERSHIP_INVALID",
      422,
    );
  }
  if (input.priceCents < 100 || input.priceCents > 1_000_000) {
    throw new DomainError(
      "La cuota mensual debe estar entre 1 € y 10 000 €",
      "MEMBERSHIP_INVALID",
      422,
    );
  }
  // Tarifa plana "todo gratis" sin tope = pérdida garantizada: el 100% exige
  // un máximo de citas al mes.
  if (input.discountPercent === 100 && !input.maxAppointmentsPerMonth) {
    throw new DomainError(
      "Un descuento del 100% exige un tope de citas al mes",
      "MEMBERSHIP_CAP_REQUIRED",
      422,
    );
  }
  if (
    input.maxAppointmentsPerMonth !== null &&
    (input.maxAppointmentsPerMonth < 1 || input.maxAppointmentsPerMonth > 100)
  ) {
    throw new DomainError(
      "El tope mensual debe estar entre 1 y 100 citas",
      "MEMBERSHIP_INVALID",
      422,
    );
  }
}

/**
 * Alta de un cliente en un plan de membresía. Devuelve la fila creada.
 * Requiere tarjeta guardada (CARD_REQUIRED 409) y, con Stripe real, que el
 * negocio tenga su cuenta conectada lista (BUSINESS_PAYMENTS_DISABLED 409).
 */
export async function subscribeToPlan(params: {
  clientId: string;
  planId: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const plan = await prisma.membershipPlan.findFirst({
    where: { id: params.planId, active: true, business: { active: true } },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          currency: true,
          stripeAccountId: true,
          stripeChargesEnabled: true,
        },
      },
    },
  });
  if (!plan) {
    throw new DomainError("Plan no encontrado", "MEMBERSHIP_PLAN_NOT_FOUND", 404);
  }

  const existing = await prisma.clientMembership.findFirst({
    where: {
      businessId: plan.businessId,
      clientId: params.clientId,
      status: { in: LIVE_STATUSES },
    },
    select: { id: true },
  });
  if (existing) {
    throw new DomainError(
      "Ya tienes una membresía activa en este negocio",
      "MEMBERSHIP_EXISTS",
      409,
    );
  }

  if (!isConfigured()) {
    assertSimulationAllowed();
    return prisma.clientMembership.create({
      data: {
        businessId: plan.businessId,
        planId: plan.id,
        clientId: params.clientId,
        status: "active",
        stripeSubscriptionId: `dev_sub_${params.clientId.slice(-6)}_${now.getTime()}`,
        currentPeriodEnd: new Date(now.getTime() + THIRTY_DAYS_MS),
        paymentSimulated: true,
      },
      include: { plan: { select: { name: true, discountPercent: true } } },
    });
  }

  // Stripe real: la cuota viaja a la cuenta del negocio → Connect obligatorio
  if (!plan.business.stripeAccountId || !plan.business.stripeChargesEnabled) {
    throw new DomainError(
      "Este negocio aún no puede cobrar membresías online",
      "BUSINESS_PAYMENTS_DISABLED",
      409,
    );
  }
  const account = await prisma.user.findUniqueOrThrow({
    where: { id: params.clientId },
    select: { stripeCustomerId: true },
  });
  if (!account.stripeCustomerId || account.stripeCustomerId.startsWith("dev_")) {
    throw new DomainError(
      "Necesitas una tarjeta guardada para la membresía",
      "CARD_REQUIRED",
      409,
    );
  }
  const methods = await stripe().paymentMethods.list({
    customer: account.stripeCustomerId,
    type: "card",
    limit: 1,
  });
  const method = methods.data[0];
  if (!method) {
    throw new DomainError(
      "Necesitas una tarjeta guardada para la membresía",
      "CARD_REQUIRED",
      409,
    );
  }

  const priceId = await ensurePlanPrice(plan);

  // La fila existe ANTES de crear la suscripción para poder referenciarla en
  // metadata.membershipId; si Stripe falla, se borra (compensación).
  const membership = await prisma.clientMembership.create({
    data: {
      businessId: plan.businessId,
      planId: plan.id,
      clientId: params.clientId,
      status: "active",
      currentPeriodEnd: new Date(now.getTime() + THIRTY_DAYS_MS),
    },
  });

  try {
    const feePercent = Number(process.env.STRIPE_PLATFORM_FEE_PERCENT ?? "0");
    const subscription = await stripe().subscriptions.create({
      customer: account.stripeCustomerId,
      items: [{ price: priceId }],
      default_payment_method: method.id,
      transfer_data: { destination: plan.business.stripeAccountId },
      ...(feePercent > 0 ? { application_fee_percent: feePercent } : {}),
      // El dispatcher de webhooks enruta por kind: "membership" (colisión
      // B2B/B2C documentada en INTEGRACIONES-EXTERNAS.md)
      metadata: {
        kind: "membership",
        membershipId: membership.id,
        businessId: plan.businessId,
      },
    });
    const periodEnd = subscription.items.data[0]?.current_period_end ?? null;
    return await prisma.clientMembership.update({
      where: { id: membership.id },
      data: {
        stripeSubscriptionId: subscription.id,
        status: mapStatus(subscription.status),
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      },
      include: { plan: { select: { name: true, discountPercent: true } } },
    });
  } catch (error) {
    await prisma.clientMembership
      .delete({ where: { id: membership.id } })
      .catch(() => {});
    if (error instanceof DomainError) throw error;
    logError("memberships.subscribe.failed", error, { planId: plan.id });
    throw new DomainError(
      "No se pudo activar la membresía",
      "MEMBERSHIP_SUBSCRIBE_FAILED",
      502,
    );
  }
}

/** Baja: el beneficio se mantiene hasta el fin del periodo ya pagado. */
export async function cancelMembership(params: {
  clientId: string;
  membershipId: string;
}) {
  const membership = await prisma.clientMembership.findFirst({
    where: { id: params.membershipId, clientId: params.clientId },
  });
  if (!membership) {
    throw new DomainError("Membresía no encontrada", "MEMBERSHIP_NOT_FOUND", 404);
  }
  if (membership.status === "canceled") return membership;

  if (
    !membership.paymentSimulated &&
    membership.stripeSubscriptionId &&
    isConfigured()
  ) {
    await stripe().subscriptions.update(membership.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  }
  return prisma.clientMembership.update({
    where: { id: membership.id },
    data: { cancelAtPeriodEnd: true },
  });
}

function mapStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    default:
      return "canceled";
  }
}

/**
 * Sincroniza una fila de membresía con el estado real de su suscripción de
 * Stripe. La invoca el dispatcher compartido de webhooks (billing/payments)
 * cuando metadata.kind === "membership".
 */
export async function applyMembershipSubscriptionEvent(
  subscription: Stripe.Subscription,
): Promise<void> {
  const membershipId = subscription.metadata?.membershipId ?? null;
  const membership = await prisma.clientMembership.findFirst({
    where: membershipId
      ? { OR: [{ id: membershipId }, { stripeSubscriptionId: subscription.id }] }
      : { stripeSubscriptionId: subscription.id },
    select: { id: true },
  });
  if (!membership) return;

  const periodEnd = subscription.items.data[0]?.current_period_end ?? null;
  await prisma.clientMembership.update({
    where: { id: membership.id },
    data: {
      status: mapStatus(subscription.status),
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}

/**
 * Mantenimiento de las membresías simuladas (cron). En desarrollo renueva las
 * activas vencidas (+30 días) o las cierra si pidieron la baja; en producción
 * una fila simulada no debe existir: se cierra sin renovar.
 */
export async function renewSimulatedMemberships(
  now = new Date(),
): Promise<{ renewed: number; ended: number }> {
  const due = await prisma.clientMembership.findMany({
    where: {
      paymentSimulated: true,
      status: "active",
      currentPeriodEnd: { lt: now },
    },
    select: { id: true, cancelAtPeriodEnd: true, currentPeriodEnd: true },
  });
  let renewed = 0;
  let ended = 0;
  for (const m of due) {
    const mustEnd =
      m.cancelAtPeriodEnd || process.env.NODE_ENV === "production";
    if (mustEnd) {
      await prisma.clientMembership.update({
        where: { id: m.id },
        data: { status: "canceled" },
      });
      ended++;
    } else {
      await prisma.clientMembership.update({
        where: { id: m.id },
        data: {
          currentPeriodEnd: new Date(
            (m.currentPeriodEnd ?? now).getTime() + THIRTY_DAYS_MS,
          ),
        },
      });
      renewed++;
    }
  }
  return { renewed, ended };
}

// --- Internos ----------------------------------------------------------------

/** Crea (una sola vez) el producto+precio recurrente del plan en Stripe. */
async function ensurePlanPrice(plan: {
  id: string;
  name: string;
  priceCents: number;
  stripePriceId: string | null;
  businessId: string;
  business: { name: string; currency: string };
}): Promise<string> {
  if (plan.stripePriceId) return plan.stripePriceId;
  const product = await stripe().products.create({
    name: `Membresía ${plan.name} · ${plan.business.name}`,
    metadata: { membershipPlanId: plan.id, businessId: plan.businessId },
  });
  const price = await stripe().prices.create({
    product: product.id,
    unit_amount: plan.priceCents,
    currency: plan.business.currency.toLowerCase(),
    recurring: { interval: "month" },
  });
  await prisma.membershipPlan.update({
    where: { id: plan.id },
    data: { stripePriceId: price.id },
  });
  return price.id;
}
