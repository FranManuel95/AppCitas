// Pasarela de pagos con proveedor intercambiable. Stripe cuando hay claves;
// un adaptador simulado en desarrollo para poder ejercitar el flujo completo
// (guardar tarjeta → cargo por cancelación tardía) sin cuenta real.

export interface ChargeParams {
  customerId: string;
  amountCents: number;
  currency: string;
  description: string;
  metadata?: Record<string, string>;
}

export interface ChargeResult {
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
}

import { stripeProvider } from "./stripe";
import { devProvider } from "./dev";

export function getPaymentProvider(): PaymentProvider {
  return stripeProvider.isConfigured() ? stripeProvider : devProvider;
}

export function paymentsPubliclyConfigured(): boolean {
  // El wizard solo muestra el paso de tarjeta real si hay clave publicable
  return (
    !!process.env.STRIPE_SECRET_KEY &&
    !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  );
}
