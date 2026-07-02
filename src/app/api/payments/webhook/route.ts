import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

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

  if (
    event.type === "payment_intent.succeeded" ||
    event.type === "payment_intent.payment_failed"
  ) {
    const intent = event.data.object as Stripe.PaymentIntent;
    const appointmentId = intent.metadata?.appointmentId;
    if (appointmentId) {
      await prisma.appointment
        .update({
          where: { id: appointmentId },
          data: {
            paymentStatus:
              event.type === "payment_intent.succeeded"
                ? "CHARGED"
                : "CHARGE_FAILED",
            paymentRef: intent.id,
          },
        })
        .catch(() => {
          // La cita pudo eliminarse; el webhook no debe reintentar por esto
        });
    }
  }

  return NextResponse.json({ received: true });
}
