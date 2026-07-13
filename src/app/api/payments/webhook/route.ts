import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { claimWebhookEvent } from "@/lib/webhooks/idempotency";
import { syncConnectAccount } from "@/lib/billing/connect";
import { syncInvoiceForAppointment } from "@/lib/domain/invoices";
import { logError } from "@/lib/logger";

// POST /api/payments/webhook — eventos de Stripe (verificados por firma).
// Mantiene el estado de cobro de la cita sincronizado con la pasarela para
// cargos asíncronos (SCA, disputas de tarjeta, reintentos del banco…).
export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe no configurado" },
      { status: 501 },
    );
  }

  const stripe = new Stripe(secretKey);
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Falta la firma" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    // Verificación con el cuerpo crudo: no usar request.json()
    const payload = await request.text();
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Firma no válida" }, { status: 400 });
  }

  // Idempotencia: Stripe reintenta y reordena. Si ya procesamos este evento,
  // respondemos 200 sin re-aplicar el cambio de estado del cobro.
  const fresh = await claimWebhookEvent(event.id, event.type);
  if (!fresh) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Stripe Connect: la cuenta conectada del negocio cambió de estado (terminó
  // el onboarding, ya puede aceptar cobros, etc.). Sincroniza chargesEnabled.
  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    try {
      await syncConnectAccount(account);
    } catch (error) {
      logError("payments.webhook.account", error, { accountId: account.id });
    }
    return NextResponse.json({ received: true });
  }

  if (
    event.type === "payment_intent.succeeded" ||
    event.type === "payment_intent.payment_failed"
  ) {
    const intent = event.data.object as Stripe.PaymentIntent;
    const appointmentId = intent.metadata?.appointmentId;
    if (appointmentId) {
      try {
        const updated = await prisma.appointment.update({
          where: { id: appointmentId },
          data: {
            paymentStatus:
              event.type === "payment_intent.succeeded"
                ? "CHARGED"
                : "CHARGE_FAILED",
            paymentRef: intent.id,
          },
        });
        // Cobro asíncrono confirmado (SCA): emitir la factura si procede
        if (event.type === "payment_intent.succeeded") {
          await syncInvoiceForAppointment(updated);
        }
      } catch (error) {
        // La cita pudo eliminarse (P2025): no es un fallo del webhook, no se
        // debe reintentar. Cualquier otro error sí se registra para diagnóstico.
        const code =
          error instanceof Error && "code" in error
            ? (error as { code?: unknown }).code
            : undefined;
        if (code !== "P2025") {
          logError("payments.webhook.update", error, { appointmentId });
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
