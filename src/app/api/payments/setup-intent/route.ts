import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";
import { getPaymentProvider } from "@/lib/payments";

// POST /api/payments/setup-intent — prepara el guardado de tarjeta del
// cliente autenticado (SetupIntent de Stripe o simulado en desarrollo).
export const POST = apiHandler(async () => {
  const sessionUser = await apiRequireUser();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
    select: { id: true, email: true, name: true, stripeCustomerId: true },
  });

  const provider = getPaymentProvider();
  const customerId = await provider.ensureCustomer(user, user.stripeCustomerId);

  if (customerId !== user.stripeCustomerId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const { clientSecret } = await provider.createSetupIntent(customerId);

  return NextResponse.json({
    provider: provider.name,
    clientSecret,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
  });
});

// GET — ¿tiene el cliente tarjeta guardada?
export const GET = apiHandler(async () => {
  const sessionUser = await apiRequireUser();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
    select: { stripeCustomerId: true },
  });

  const provider = getPaymentProvider();
  const hasCard = user.stripeCustomerId
    ? await provider.hasSavedCard(user.stripeCustomerId)
    : false;

  return NextResponse.json({ provider: provider.name, hasCard });
});
