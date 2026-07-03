import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireSuperAdmin } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";

// Suspender/reactivar un negocio a nivel plataforma (Business.active). Un
// negocio suspendido deja de operar; es una palanca del super-admin, no del
// propio negocio.
const patchSchema = z.object({ active: z.boolean() });

export const PATCH = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    await apiRequireSuperAdmin();
    const { id } = await params;
    const { active } = patchSchema.parse(await request.json());

    const existing = await prisma.business.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new DomainError("Negocio no encontrado", "BUSINESS_NOT_FOUND", 404);
    }

    const business = await prisma.business.update({
      where: { id },
      data: { active },
      select: { id: true, active: true },
    });
    return NextResponse.json({ business });
  },
);
