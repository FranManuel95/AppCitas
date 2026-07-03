import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/lib/billing";

// POST /api/billing/webhook — eventos de suscripción B2B de Stripe.
// No usa apiHandler: necesita el cuerpo CRUDO para verificar la firma.
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    // No usar request.json(): la verificación de firma exige el payload literal.
    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature");
    const result = await handleStripeWebhook(rawBody, signature);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook no válido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
