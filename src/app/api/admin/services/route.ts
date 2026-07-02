import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  durationMinutes: z.number().int().min(5).max(600),
  priceCents: z.number().int().min(0).max(1_000_000),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const GET = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  const services = await prisma.service.findMany({
    where: { businessId: admin.businessId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ services });
});

export const POST = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const data = createSchema.parse(await request.json());

  const service = await prisma.service.create({
    data: { ...data, businessId: admin.businessId },
  });
  return NextResponse.json({ service }, { status: 201 });
});
