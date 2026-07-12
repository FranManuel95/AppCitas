import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/domain/errors";
import type { PlanId } from "@/lib/domain/plans";
import { claimWebhookEvent } from "@/lib/webhooks/idempotency";

// Facturación B2B: la suscripción que cada NEGOCIO paga a la plataforma
// (distinto del cobro B2C de cancelaciones en src/lib/payments). Capa fina
// sobre Stripe con un modo DEV: sin STRIPE_SECRET_KEY nada llama a Stripe y las
// operaciones se simulan directamente en la base de datos, permitiendo recorrer
// el flujo completo (mejorar a Pro → gestionar → cancelar) en local.

let client: Stripe | null = null;

function stripe(): Stripe {
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return client;
}

/** Hay Stripe real configurado; si es false, todo funciona en modo simulado. */
export function isBillingConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * La simulación del modo dev (activar Pro / cancelar sin pasar por Stripe) NUNCA
 * debe ejecutarse en producción: allí, la ausencia de STRIPE_SECRET_KEY es un
 * error de despliegue, no un upgrade gratis para cada negocio. Se aborta con un
 * error duro, mismo criterio que el cron de notificaciones (jobs/notifications).
 */
function assertSimulationAllowed(): void {
  if (process.env.NODE_ENV === "production") {
    throw new DomainError(
      "La facturación no está configurada en este entorno",
      "BILLING_NOT_CONFIGURED",
      503,
    );
  }
}

export interface CheckoutParams {
  businessId: string;
  ownerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface PortalParams {
  businessId: string;
  returnUrl: string;
}

export interface BillingSession {
  url: string;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Inicia la suscripción Pro del negocio. En modo Stripe crea (o reutiliza) el
 * customer de la plataforma y abre una Checkout Session de suscripción. En modo
 * dev activa el plan Pro directamente y devuelve la URL de éxito (simulación).
 */
export async function createCheckoutSession(
  params: CheckoutParams,
): Promise<BillingSession> {
  const { businessId, ownerEmail, successUrl, cancelUrl } = params;

  if (!isBillingConfigured()) {
    assertSimulationAllowed();
    // Activación simulada: marca Pro y una renovación a 30 días.
    await prisma.business.update({
      where: { id: businessId },
      data: {
        plan: "pro",
        subscriptionStatus: "active",
        planRenewsAt: new Date(Date.now() + THIRTY_DAYS_MS),
      },
    });
    return { url: successUrl };
  }

  const priceId = process.env.STRIPE_PRICE_PRO;
  if (!priceId) {
    throw new DomainError(
      "Falta configurar el precio de la suscripción Pro (STRIPE_PRICE_PRO)",
      "BILLING_PRICE_MISSING",
      500,
    );
  }

  const customerId = await ensureCustomer(businessId, ownerEmail);

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    // SEPA además de tarjeta: la domiciliación bancaria cuesta ~0,35 €/recibo
    // frente al ~1,5 % + 0,25 € de la tarjeta — en cuotas mensuales es lo que
    // usan casi todos los SaaS. Requiere activar "SEPA Direct Debit" en el
    // dashboard de Stripe (Settings → Payment methods); si no está activo,
    // Stripe simplemente no lo ofrece en el Checkout.
    payment_method_types: ["card", "sepa_debit"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { businessId },
    // Propaga el negocio a la suscripción para localizarlo en sus webhooks.
    subscription_data: { metadata: { businessId } },
  });

  if (!session.url) {
    throw new DomainError(
      "No se pudo iniciar el pago de la suscripción",
      "BILLING_CHECKOUT_FAILED",
      502,
    );
  }
  return { url: session.url };
}

/**
 * Portal de facturación de Stripe (cambiar tarjeta, ver recibos, cancelar). En
 * modo dev, si el negocio es Pro lo baja a Free/canceled (simula gestionar y
 * cancelar) y devuelve la URL de retorno.
 */
export async function createPortalSession(
  params: PortalParams,
): Promise<BillingSession> {
  const { businessId, returnUrl } = params;

  if (!isBillingConfigured()) {
    assertSimulationAllowed();
    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { plan: true },
    });
    if (business.plan === "pro") {
      await prisma.business.update({
        where: { id: businessId },
        data: {
          plan: "free",
          subscriptionStatus: "canceled",
          planRenewsAt: null,
        },
      });
    }
    return { url: returnUrl };
  }

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { platformStripeCustomerId: true },
  });
  if (!business.platformStripeCustomerId) {
    throw new DomainError(
      "El negocio no tiene una suscripción que gestionar",
      "BILLING_NO_CUSTOMER",
      400,
    );
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: business.platformStripeCustomerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

/**
 * Verifica y procesa un webhook de Stripe (firma con STRIPE_WEBHOOK_SECRET).
 * Idempotente: sincroniza plan, estado, id de suscripción y renovación del
 * negocio ante altas/cambios/bajas de suscripción y checkout completado.
 */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
): Promise<{ received: true }> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!isBillingConfigured() || !webhookSecret) {
    throw new DomainError(
      "Facturación no configurada",
      "BILLING_NOT_CONFIGURED",
      400,
    );
  }
  if (!signature) {
    throw new DomainError("Falta la firma de Stripe", "BILLING_NO_SIGNATURE", 400);
  }

  const event = stripe().webhooks.constructEvent(
    rawBody,
    signature,
    webhookSecret,
  );

  // Idempotencia: no re-aplicar un evento ya procesado (Stripe reintenta y
  // reordena). Se reclama antes de tocar la suscripción del negocio.
  const fresh = await claimWebhookEvent(event.id, event.type);
  if (!fresh) return { received: true };

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription?.id ?? null);
      if (subscriptionId) {
        const subscription = await stripe().subscriptions.retrieve(
          subscriptionId,
        );
        await applySubscription(
          subscription,
          session.metadata?.businessId ?? null,
        );
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const snapshot = event.data.object as Stripe.Subscription;
      // Stripe no garantiza el orden de entrega: un `updated` viejo (snapshot
      // "active") puede llegar tras un `deleted` y re-activaría Pro si confiamos
      // en el snapshot. Recuperamos el estado ACTUAL de la suscripción y
      // aplicamos ese; así el resultado no depende del orden de los eventos.
      const subscription = await stripe().subscriptions.retrieve(snapshot.id);
      await applySubscription(
        subscription,
        subscription.metadata?.businessId ??
          snapshot.metadata?.businessId ??
          null,
      );
      break;
    }
    default:
      // Otros eventos no nos interesan; responder 200 evita reintentos.
      break;
  }

  return { received: true };
}

// --- Internos ---------------------------------------------------------------

async function ensureCustomer(
  businessId: string,
  ownerEmail: string,
): Promise<string> {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { platformStripeCustomerId: true },
  });
  if (business.platformStripeCustomerId) {
    return business.platformStripeCustomerId;
  }

  const customer = await stripe().customers.create({
    email: ownerEmail,
    metadata: { businessId },
  });
  await prisma.business.update({
    where: { id: businessId },
    data: { platformStripeCustomerId: customer.id },
  });
  return customer.id;
}

/** Mapea el estado de suscripción de Stripe a nuestro subscriptionStatus. */
function mapSubscriptionStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "canceled";
    default:
      return "canceled";
  }
}

/**
 * Aplica el estado de una suscripción de Stripe al negocio correspondiente.
 * Localiza el negocio por metadata.businessId y, si falla, por el customer de
 * la plataforma. Si no encuentra negocio, no hace nada (webhook idempotente).
 */
async function applySubscription(
  subscription: Stripe.Subscription,
  metadataBusinessId: string | null,
): Promise<void> {
  const businessId = await resolveBusinessId(subscription, metadataBusinessId);
  if (!businessId) return;

  const status = mapSubscriptionStatus(subscription.status);
  const plan: PlanId = status === "canceled" ? "free" : "pro";

  // current_period_end vive en cada item de la suscripción (Stripe API 2025+).
  const periodEnd = subscription.items.data[0]?.current_period_end ?? null;
  const planRenewsAt = periodEnd ? new Date(periodEnd * 1000) : null;

  await prisma.business.update({
    where: { id: businessId },
    data: {
      plan,
      subscriptionStatus: status,
      platformStripeSubscriptionId: subscription.id,
      planRenewsAt,
    },
  });
}

async function resolveBusinessId(
  subscription: Stripe.Subscription,
  metadataBusinessId: string | null,
): Promise<string | null> {
  if (metadataBusinessId) {
    const byId = await prisma.business.findUnique({
      where: { id: metadataBusinessId },
      select: { id: true },
    });
    if (byId) return byId.id;
  }

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const byCustomer = await prisma.business.findFirst({
    where: { platformStripeCustomerId: customerId },
    select: { id: true },
  });
  return byCustomer?.id ?? null;
}
