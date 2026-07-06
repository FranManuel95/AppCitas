import { prisma } from "@/lib/prisma";
import { getPaymentProvider } from "./index";
import { platformFeeCents } from "@/lib/billing/connect";

export interface CollectionOutcome {
  // NONE | CHARGED | SIMULATED | CHARGE_FAILED | UNCOLLECTED
  paymentStatus: string;
  paymentRef: string | null;
}

// Intenta cobrar el cargo de una cita (cancelación tardía / no-show) con la
// tarjeta guardada del cliente. Si no hay tarjeta, queda UNCOLLECTED y el
// negocio lo gestiona en persona; el importe ya está registrado en la cita.
// Con Stripe Connect activo en el negocio, el cobro se envía a SU cuenta.
export async function collectAppointmentCharge(params: {
  appointmentId: string;
  businessId: string;
  clientId: string;
  amountCents: number;
  currency: string;
  description: string;
}): Promise<CollectionOutcome> {
  const { appointmentId, businessId, clientId, amountCents, currency, description } =
    params;
  if (amountCents <= 0) {
    return { paymentStatus: "NONE", paymentRef: null };
  }

  const client = await prisma.user.findUniqueOrThrow({
    where: { id: clientId },
    select: { stripeCustomerId: true },
  });
  if (!client.stripeCustomerId) {
    return { paymentStatus: "UNCOLLECTED", paymentRef: null };
  }

  // Si el negocio tiene cuenta conectada activa, el dinero va a su cuenta y la
  // plataforma retiene su comisión; si no, cae en la cuenta de la plataforma.
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { stripeAccountId: true, stripeChargesEnabled: true },
  });
  const routed =
    business.stripeAccountId && business.stripeChargesEnabled
      ? {
          destinationAccountId: business.stripeAccountId,
          applicationFeeCents: platformFeeCents(amountCents),
        }
      : {};

  const provider = getPaymentProvider();
  const result = await provider.charge({
    customerId: client.stripeCustomerId,
    amountCents,
    currency,
    description,
    metadata: { appointmentId },
    ...routed,
  });

  if (!result.ok) {
    return { paymentStatus: "CHARGE_FAILED", paymentRef: result.ref ?? null };
  }
  return {
    paymentStatus: result.simulated ? "SIMULATED" : "CHARGED",
    paymentRef: result.ref ?? null,
  };
}

export interface DepositOutcome {
  // NONE | CHARGED | SIMULATED | FAILED
  depositStatus: string;
  depositRef: string | null;
}

// Señal al reservar: se cobra en el acto con la tarjeta guardada del cliente.
// Sin tarjeta no hay señal (NONE, la reserva sigue; el negocio debería exigir
// tarjeta con requireCardToBook). Un cargo rechazado devuelve FAILED y el
// llamador deshace la reserva. Mismo enrutado Connect que el resto de cobros.
export async function collectBookingDeposit(params: {
  appointmentId: string;
  businessId: string;
  clientId: string;
  amountCents: number;
  currency: string;
  description: string;
}): Promise<DepositOutcome> {
  const { appointmentId, businessId, clientId, amountCents, currency, description } =
    params;
  if (amountCents <= 0) {
    return { depositStatus: "NONE", depositRef: null };
  }

  const client = await prisma.user.findUniqueOrThrow({
    where: { id: clientId },
    select: { stripeCustomerId: true },
  });
  if (!client.stripeCustomerId) {
    return { depositStatus: "NONE", depositRef: null };
  }

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { stripeAccountId: true, stripeChargesEnabled: true },
  });
  const routed =
    business.stripeAccountId && business.stripeChargesEnabled
      ? {
          destinationAccountId: business.stripeAccountId,
          applicationFeeCents: platformFeeCents(amountCents),
        }
      : {};

  const result = await getPaymentProvider().charge({
    customerId: client.stripeCustomerId,
    amountCents,
    currency,
    description,
    metadata: { appointmentId, kind: "deposit" },
    ...routed,
  });

  if (!result.ok) {
    return { depositStatus: "FAILED", depositRef: result.ref ?? null };
  }
  return {
    depositStatus: result.simulated ? "SIMULATED" : "CHARGED",
    depositRef: result.ref ?? null,
  };
}

// Reembolso íntegro de un cargo previo (señal al cancelar en plazo).
export async function refundCollectedPayment(
  chargeRef: string,
): Promise<{ ok: boolean }> {
  const result = await getPaymentProvider().refund(chargeRef);
  return { ok: result.ok };
}
