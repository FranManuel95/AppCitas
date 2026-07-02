import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";

const querySchema = z.object({
  businessId: z.string().min(1),
  serviceId: z.string().optional(),
});

// GET /api/me/packages?businessId=…[&serviceId=…]
// Bonos canjeables del cliente (con saldo y sin caducar) para el wizard.
export const GET = apiHandler(async (request: Request) => {
  const user = await apiRequireUser();
  const url = new URL(request.url);
  const { businessId, serviceId } = querySchema.parse(
    Object.fromEntries(url.searchParams),
  );

  const packages = await prisma.clientPackage.findMany({
    where: {
      clientId: user.id,
      businessId,
      remainingSessions: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      ...(serviceId ? { package: { serviceId } } : {}),
    },
    include: {
      package: {
        select: { name: true, serviceId: true, service: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    packages: packages.map((p) => ({
      id: p.id,
      name: p.package.name,
      serviceId: p.package.serviceId,
      serviceName: p.package.service.name,
      remainingSessions: p.remainingSessions,
      expiresAt: p.expiresAt?.toISOString() ?? null,
    })),
  });
});
