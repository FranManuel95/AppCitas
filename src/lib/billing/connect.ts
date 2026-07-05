import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/domain/errors";

// Stripe Connect: conecta la cuenta del NEGOCIO para que los cobros B2C
// (no-show/cancelación a sus clientes) lleguen directamente a su banco, con una
// comisión opcional de la plataforma. Es independiente de:
//  - src/lib/payments (cómo se cobra al cliente final), y
//  - src/lib/billing (la suscripción que el negocio paga a la plataforma).
//
// Modo DEV: sin STRIPE_SECRET_KEY nada llama a Stripe; el "onboarding" marca la
// cuenta como activa en la BD para poder recorrer el flujo completo en local.

let client: Stripe | null = null;
function stripe(): Stripe {
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

export function isConnectConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// La simulación (activar la cuenta sin pasar por Stripe) nunca debe correr en
// producción: allí, la falta de clave es un error de despliegue.
function assertSimulationAllowed(): void {
  if (process.env.NODE_ENV === "production") {
    throw new DomainError(
      "Los cobros no están configurados en este entorno",
      "CONNECT_NOT_CONFIGURED",
      503,
    );
  }
}

/**
 * Comisión de la plataforma sobre un cobro B2C, en céntimos. Se configura con
 * STRIPE_PLATFORM_FEE_PERCENT (0 por defecto: la plataforma no se queda nada y
 * el negocio recibe el importe íntegro).
 */
export function platformFeeCents(amountCents: number): number {
  const pct = Number(process.env.STRIPE_PLATFORM_FEE_PERCENT ?? "0");
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return Math.min(amountCents, Math.round((amountCents * pct) / 100));
}

export interface ConnectSummary {
  connected: boolean;
  chargesEnabled: boolean;
  status: string; // none | pending | active
}

export async function getConnectSummary(
  businessId: string,
): Promise<ConnectSummary> {
  const b = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { stripeAccountId: true, stripeAccountStatus: true, stripeChargesEnabled: true },
  });
  return {
    connected: !!b.stripeAccountId,
    chargesEnabled: b.stripeChargesEnabled,
    status: b.stripeAccountStatus,
  };
}

export interface OnboardingParams {
  businessId: string;
  ownerEmail: string;
  refreshUrl: string;
  returnUrl: string;
}

/**
 * Inicia (o reanuda) el onboarding de la cuenta conectada del negocio y
 * devuelve la URL a la que redirigir. En modo dev activa la cuenta en la BD y
 * devuelve la URL de retorno.
 */
export async function startConnectOnboarding(
  params: OnboardingParams,
): Promise<{ url: string }> {
  const { businessId, ownerEmail, refreshUrl, returnUrl } = params;

  if (!isConnectConfigured()) {
    assertSimulationAllowed();
    await prisma.business.update({
      where: { id: businessId },
      data: {
        stripeAccountId: `dev_acct_${businessId}`,
        stripeAccountStatus: "active",
        stripeChargesEnabled: true,
      },
    });
    return { url: returnUrl };
  }

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { stripeAccountId: true },
  });

  let accountId = business.stripeAccountId;
  if (!accountId || accountId.startsWith("dev_")) {
    const account = await stripe().accounts.create({
      type: "express",
      email: ownerEmail,
      metadata: { businessId },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    accountId = account.id;
    await prisma.business.update({
      where: { id: businessId },
      data: { stripeAccountId: accountId, stripeAccountStatus: "pending" },
    });
  }

  const link = await stripe().accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return { url: link.url };
}

// Traduce el estado de una cuenta de Stripe a nuestro stripeAccountStatus.
function statusFor(account: Pick<Stripe.Account, "charges_enabled" | "details_submitted">): string {
  if (account.charges_enabled) return "active";
  return account.details_submitted ? "pending" : "pending";
}

/**
 * Sincroniza el estado de la cuenta conectada con Stripe (lo invoca el webhook
 * ante account.updated). Marca si la cuenta ya puede aceptar cobros.
 */
export async function syncConnectAccount(account: Stripe.Account): Promise<void> {
  await prisma.business.updateMany({
    where: { stripeAccountId: account.id },
    data: {
      stripeChargesEnabled: !!account.charges_enabled,
      stripeAccountStatus: statusFor(account),
    },
  });
}
