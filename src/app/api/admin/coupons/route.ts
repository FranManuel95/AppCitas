import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";

const createSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(30)
      .regex(/^[A-Za-z0-9_-]+$/, "Solo letras, números, guiones"),
    type: z.enum(["PERCENT", "FIXED"]),
    value: z.number().int().min(1),
    maxRedemptions: z.number().int().min(1).nullable().optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .refine((d) => d.type !== "PERCENT" || d.value <= 100, {
    message: "El porcentaje no puede superar 100",
    path: ["value"],
  });

export const GET = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  const coupons = await prisma.coupon.findMany({
    where: { businessId: admin.businessId },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ coupons });
});

export const POST = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const data = createSchema.parse(await request.json());
  const code = data.code.toUpperCase();

  const existing = await prisma.coupon.findUnique({
    where: { businessId_code: { businessId: admin.businessId, code } },
    select: { id: true },
  });
  if (existing) {
    throw new DomainError("Ya existe un cupón con ese código", "DUPLICATE", 409);
  }

  const coupon = await prisma.coupon.create({
    data: {
      businessId: admin.businessId,
      code,
      type: data.type,
      value: data.value,
      maxRedemptions: data.maxRedemptions ?? null,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    },
  });
  return NextResponse.json({ coupon }, { status: 201 });
});
