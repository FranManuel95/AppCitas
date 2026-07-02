import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";
import { getPaymentProvider } from "@/lib/payments";
import { DomainError } from "@/lib/domain/errors";

const schema = z.object({ packageId: z.string().min(1) });

// POST /api/packages/purchase — compra de un bono por el cliente autenticado.
// Si tiene tarjeta guardada se cobra en el acto; si no, queda pendiente de
// cobro en persona (el negocio lo ve en el estado del bono).
export const POST = apiHandler(async (request: Request) => {
  const user = await apiRequireUser();
  const { packageId } = schema.parse(await request.json());

  const pkg = await prisma.package.findFirst({
    where: { id: packageId, active: true, business: { active: true } },
    include: {
      business: { select: { id: true, name: true, currency: true } },
      service: { select: { name: true } },
    },
  });
  if (!pkg) throw new DomainError("Bono no encontrado", "PACKAGE_NOT_FOUND", 404);

  // Cobro con tarjeta guardada (si existe)
  let paymentStatus = "UNCOLLECTED";
  let paymentRef: string | null = null;
  const account = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { stripeCustomerId: true },
  });
  if (account.stripeCustomerId) {
    const result = await getPaymentProvider().charge({
      customerId: account.stripeCustomerId,
      amountCents: pkg.priceCents,
      currency: pkg.business.currency,
      description: `Bono ${pkg.name} · ${pkg.business.name}`,
      metadata: { packageId: pkg.id },
    });
    if (result.ok) {
      paymentStatus = result.simulated ? "SIMULATED" : "CHARGED";
      paymentRef = result.ref ?? null;
    }
  }

  const purchase = await prisma.clientPackage.create({
    data: {
      businessId: pkg.business.id,
      packageId: pkg.id,
      clientId: user.id,
      remainingSessions: pkg.sessions,
      expiresAt: pkg.validityDays
        ? new Date(Date.now() + pkg.validityDays * 24 * 3_600_000)
        : null,
      pricePaidCents: pkg.priceCents,
      paymentStatus,
      paymentRef,
    },
  });

  return NextResponse.json(
    {
      purchase: {
        id: purchase.id,
        package: pkg.name,
        service: pkg.service.name,
        remainingSessions: purchase.remainingSessions,
        expiresAt: purchase.expiresAt?.toISOString() ?? null,
        paymentStatus,
      },
    },
    { status: 201 },
  );
});
