import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { assertServicesOwned } from "@/lib/domain/ownership";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const hourSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  openTime: z.string().regex(timeRegex),
  closeTime: z.string().regex(timeRegex),
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  // Ids de servicios que realiza; vacío/omitido = todos
  serviceIds: z.array(z.string()).max(100).optional(),
  // Horario propio; vacío/omitido = hereda el del negocio
  hours: z.array(hourSchema).max(28).optional(),
});

export const GET = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  const staff = await prisma.staffMember.findMany({
    where: { businessId: admin.businessId },
    include: {
      hours: { orderBy: [{ weekday: "asc" }, { openTime: "asc" }] },
      services: { select: { serviceId: true } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ staff });
});

export const POST = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const data = createSchema.parse(await request.json());

  // Aislamiento: los servicios vinculados deben ser del propio negocio.
  await assertServicesOwned(admin.businessId, data.serviceIds);

  const member = await prisma.staffMember.create({
    data: {
      businessId: admin.businessId,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      color: data.color ?? "#0ea5e9",
      hours: { create: data.hours ?? [] },
      services: {
        create: (data.serviceIds ?? []).map((serviceId) => ({ serviceId })),
      },
    },
    include: { hours: true, services: { select: { serviceId: true } } },
  });
  return NextResponse.json({ staff: member }, { status: 201 });
});
