import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  serviceId: z.string().min(1),
  sessions: z.number().int().min(2).max(100),
  priceCents: z.number().int().min(0).max(10_000_000),
  validityDays: z.number().int().min(1).max(3650).nullable().optional(),
});

export const GET = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  const packages = await prisma.package.findMany({
    where: { businessId: admin.businessId },
    include: {
      service: { select: { name: true, priceCents: true } },
      _count: { select: { purchases: true } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ packages });
});

export const POST = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const data = createSchema.parse(await request.json());

  const service = await prisma.service.findFirst({
    where: { id: data.serviceId, businessId: admin.businessId },
    select: { id: true },
  });
  if (!service) {
    throw new DomainError("Servicio no encontrado", "SERVICE_NOT_FOUND", 404);
  }

  const pkg = await prisma.package.create({
    data: {
      businessId: admin.businessId,
      serviceId: data.serviceId,
      name: data.name,
      sessions: data.sessions,
      priceCents: data.priceCents,
      validityDays: data.validityDays ?? null,
    },
  });
  return NextResponse.json({ package: pkg }, { status: 201 });
});
