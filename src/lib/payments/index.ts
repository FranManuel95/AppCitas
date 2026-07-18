// Pasarela de pagos con proveedor intercambiable. Stripe cuando hay claves;
// un adaptador simulado en desarrollo para poder ejercitar el flujo completo
// (guardar tarjeta → cargo por cancelación tardía) sin cuenta real.

export interface ChargeParams {
  customerId: string;
  amountCents: number;
  currency: string;
  description: string;
  metadata?: Record<string, string>;
  // Stripe Connect: cuenta conectada del negocio a la que enviar el cobro y
  // comisión de la plataforma. Sin destino, el cargo cae en la cuenta de la
  // plataforma (comportamiento anterior).
  destinationAccountId?: string;
  applicationFeeCents?: number;
}

export interface ChargeResult {
  ok: boolean;
  ref?: string;
  error?: string;
  simulated?: boolean;
}

export interface RefundResult {
  ok: boolean;
  ref?: string;
  error?: string;
  simulated?: boolean;
}

export interface PaymentProvider {
  readonly name: string;
  isConfigured(): boolean;
  // Devuelve el id de cliente en la pasarela (creándolo si no existe)
  ensureCustomer(
    user: { id: string; email: string; name: string },
    existingCustomerId: string | null,
  ): Promise<string>;
  createSetupIntent(customerId: string): Promise<{ clientSecret: string }>;
  hasSavedCard(customerId: string): Promise<boolean>;
  charge(params: ChargeParams): Promise<ChargeResult>;
  // Reembolso íntegro de un cargo previo (por su referencia). Lo usa la señal
  // al reservar cuando el cliente cancela dentro del plazo.
  refund(chargeRef: string): Promise<RefundResult>;
}

import { stripeProvider } from "./stripe";
import { devProvider } from "./dev";
import { DomainError } from "@/lib/domain/errors";

// La simulación de pagos (devProvider) NUNCA debe ejecutarse en producción:
// allí la ausencia de STRIPE_SECRET_KEY es un error de despliegue, no un modo
// válido — cobraría "SIMULATED" en silencio. Mismo criterio que billing,
// Connect y membresías (assertSimulationAllowed → 503). Los caminos sin cargo
// real (cancelación sin penalización, sin tarjeta guardada…) retornan antes de
// llegar aquí, así que el guard solo salta en intentos reales de cobro.
function assertSimulationAllowed(): void {
  if (process.env.NODE_ENV === "production") {
    throw new DomainError(
      "Los pagos no están configurados en este entorno",
      "PAYMENTS_NOT_CONFIGURED",
      503,
    );
  }
}

export function getPaymentProvider(): PaymentProvider {
  if (stripeProvider.isConfigured()) return stripeProvider;
  assertSimulationAllowed();
  return devProvider;
}

export function paymentsPubliclyConfigured(): boolean {
  // El wizard solo muestra el paso de tarjeta real si hay clave publicable
  return (
    !!process.env.STRIPE_SECRET_KEY &&
    !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  );
}
