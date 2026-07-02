import type { ChargeParams, ChargeResult, PaymentProvider } from "./index";

// Adaptador simulado: permite recorrer el flujo completo de pagos en local
// sin claves de Stripe. Todos los cargos "funcionan" y quedan marcados como
// simulados, nunca se usa en producción para cobrar de verdad.

let counter = 0;

export const devProvider: PaymentProvider = {
  name: "dev",

  isConfigured() {
    return true;
  },

  async ensureCustomer(user, existingCustomerId) {
    return existingCustomerId ?? `dev_cus_${user.id}`;
  },

  async createSetupIntent(customerId) {
    return { clientSecret: `dev_seti_${customerId}_${++counter}` };
  },

  async hasSavedCard(customerId) {
    return customerId.startsWith("dev_cus_");
  },

  async charge(params: ChargeParams): Promise<ChargeResult> {
    console.log(
      `[payments:dev] cargo simulado de ${params.amountCents} ${params.currency} a ${params.customerId} — ${params.description}`,
    );
    return { ok: true, ref: `dev_pi_${++counter}`, simulated: true };
  },
};
