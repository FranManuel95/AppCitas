import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({ active: z.boolean() });

// PATCH /api/admin/membership-plans/[id] — activa/desactiva un plan.
// El precio y el descuento NO se editan (los socios pagan lo contratado);
// para cambiar condiciones se crea un plan nuevo y se desactiva el antiguo.
export const PATCH = apiHandler(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const admin = await apiRequireBusinessAdmin();
    const { id } = await params;
    const { active } = patchSchema.parse(await request.json());

    const plan = await prisma.membershipPlan.findFirst({
      where: { id, businessId: admin.businessId },
      select: { id: true },
    });
    if (!plan) {
      throw new DomainError("Plan no encontrado", "MEMBERSHIP_PLAN_NOT_FOUND", 404);
    }
    const updated = await prisma.membershipPlan.update({
      where: { id },
      data: { active },
    });
    return NextResponse.json({ plan: updated });
  },
);
