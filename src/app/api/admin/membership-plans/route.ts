import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { validatePlanInput } from "@/lib/payments/memberships";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullable().optional(),
  priceCents: z.number().int(),
  discountPercent: z.number().int(),
  maxAppointmentsPerMonth: z.number().int().nullable().optional(),
});

// POST /api/admin/membership-plans — crea un plan de membresía del negocio.
export const POST = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const input = createSchema.parse(await request.json());
  validatePlanInput({
    priceCents: input.priceCents,
    discountPercent: input.discountPercent,
    maxAppointmentsPerMonth: input.maxAppointmentsPerMonth ?? null,
  });

  const plan = await prisma.membershipPlan.create({
    data: {
      businessId: admin.businessId,
      name: input.name,
      description: input.description ?? null,
      priceCents: input.priceCents,
      discountPercent: input.discountPercent,
      maxAppointmentsPerMonth: input.maxAppointmentsPerMonth ?? null,
    },
  });
  return NextResponse.json({ plan }, { status: 201 });
});
