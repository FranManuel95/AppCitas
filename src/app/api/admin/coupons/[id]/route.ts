import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";

const updateSchema = z.object({
  active: z.boolean().optional(),
  maxRedemptions: z.number().int().min(1).nullable().optional(),
  expiresAt: z.iso.datetime().nullable().optional(),
});

export const PATCH = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();
    const coupon = await prisma.coupon.findFirst({
      where: { id, businessId: admin.businessId },
      select: { id: true },
    });
    if (!coupon) {
      throw new DomainError("Cupón no encontrado", "COUPON_NOT_FOUND", 404);
    }
    const data = updateSchema.parse(await request.json());

    const updated = await prisma.coupon.update({
      where: { id },
      data: {
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.maxRedemptions !== undefined
          ? { maxRedemptions: data.maxRedemptions }
          : {}),
        ...(data.expiresAt !== undefined
          ? { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null }
          : {}),
      },
    });
    return NextResponse.json({ coupon: updated });
  },
);

// Con canjes registrados se desactiva; sin usos se elimina.
export const DELETE = apiHandler(
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();
    const coupon = await prisma.coupon.findFirst({
      where: { id, businessId: admin.businessId },
      select: { id: true, timesRedeemed: true },
    });
    if (!coupon) {
      throw new DomainError("Cupón no encontrado", "COUPON_NOT_FOUND", 404);
    }

    if (coupon.timesRedeemed > 0) {
      const updated = await prisma.coupon.update({
        where: { id },
        data: { active: false },
      });
      return NextResponse.json({ coupon: updated, softDeleted: true });
    }

    await prisma.coupon.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  },
);
