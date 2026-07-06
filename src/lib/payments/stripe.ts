import Stripe from "stripe";
import type { ChargeParams, ChargeResult, PaymentProvider } from "./index";

let client: Stripe | null = null;

function stripe(): Stripe {
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return client;
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",

  isConfigured() {
    return !!process.env.STRIPE_SECRET_KEY;
  },

  async ensureCustomer(user, existingCustomerId) {
    if (existingCustomerId && !existingCustomerId.startsWith("dev_")) {
      return existingCustomerId;
    }
    const customer = await stripe().customers.create({
      email: user.email,
      name: user.name,
      metadata: { appUserId: user.id },
    });
    return customer.id;
  },

  async createSetupIntent(customerId) {
    const intent = await stripe().setupIntents.create({
      customer: customerId,
      usage: "off_session",
      automatic_payment_methods: { enabled: true },
    });
    return { clientSecret: intent.client_secret! };
  },

  async hasSavedCard(customerId) {
    const methods = await stripe().paymentMethods.list({
      customer: customerId,
      type: "card",
      limit: 1,
    });
    return methods.data.length > 0;
  },

  async charge(params: ChargeParams): Promise<ChargeResult> {
    try {
      const methods = await stripe().paymentMethods.list({
        customer: params.customerId,
        type: "card",
        limit: 1,
      });
      const method = methods.data[0];
      if (!method) {
        return { ok: false, error: "El cliente no tiene tarjeta guardada" };
      }

      // Con cuenta conectada del negocio (Connect), el cobro se envía a su
      // cuenta y la plataforma retiene su comisión (destination charge).
      const connect = params.destinationAccountId
        ? {
            transfer_data: { destination: params.destinationAccountId },
            ...(params.applicationFeeCents && params.applicationFeeCents > 0
              ? { application_fee_amount: params.applicationFeeCents }
              : {}),
          }
        : {};

      // Cobro off-session: el cliente aceptó la política al reservar
      const intent = await stripe().paymentIntents.create({
        amount: params.amountCents,
        currency: params.currency.toLowerCase(),
        customer: params.customerId,
        payment_method: method.id,
        off_session: true,
        confirm: true,
        description: params.description,
        metadata: params.metadata,
        ...connect,
      });
      return { ok: intent.status === "succeeded", ref: intent.id };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error de Stripe";
      return { ok: false, error: message };
    }
  },

  async refund(chargeRef) {
    // Con Connect (destination charge), reverse_transfer recupera también la
    // parte transferida al negocio; en un cargo normal ese parámetro es
    // inválido, así que se reintenta sin él.
    try {
      const refund = await stripe().refunds.create({
        payment_intent: chargeRef,
        reverse_transfer: true,
      });
      return { ok: refund.status !== "failed", ref: refund.id };
    } catch {
      try {
        const refund = await stripe().refunds.create({
          payment_intent: chargeRef,
        });
        return { ok: refund.status !== "failed", ref: refund.id };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Error de Stripe";
        return { ok: false, error: message };
      }
    }
  },
};
