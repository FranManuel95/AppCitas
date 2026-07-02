import { prisma } from "@/lib/prisma";
import { getPaymentProvider } from "./index";

export interface CollectionOutcome {
  // NONE | CHARGED | SIMULATED | CHARGE_FAILED | UNCOLLECTED
  paymentStatus: string;
  paymentRef: string | null;
}

// Intenta cobrar el cargo de una cita (cancelación tardía / no-show) con la
// tarjeta guardada del cliente. Si no hay tarjeta, queda UNCOLLECTED y el
// negocio lo gestiona en persona; el importe ya está registrado en la cita.
export async function collectAppointmentCharge(params: {
  appointmentId: string;
  clientId: string;
  amountCents: number;
  currency: string;
  description: string;
}): Promise<CollectionOutcome> {
  const { appointmentId, clientId, amountCents, currency, description } =
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

  const provider = getPaymentProvider();
  const result = await provider.charge({
    customerId: client.stripeCustomerId,
    amountCents,
    currency,
    description,
    metadata: { appointmentId },
  });

  if (!result.ok) {
    return { paymentStatus: "CHARGE_FAILED", paymentRef: result.ref ?? null };
  }
  return {
    paymentStatus: result.simulated ? "SIMULATED" : "CHARGED",
    paymentRef: result.ref ?? null,
  };
}
