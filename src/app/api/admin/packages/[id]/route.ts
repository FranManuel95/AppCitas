import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  sessions: z.number().int().min(2).max(100).optional(),
  priceCents: z.number().int().min(0).max(10_000_000).optional(),
  validityDays: z.number().int().min(1).max(3650).nullable().optional(),
  active: z.boolean().optional(),
});

async function owned(businessId: string, id: string) {
  const pkg = await prisma.package.findFirst({
    where: { id, businessId },
    select: { id: true },
  });
  if (!pkg) throw new DomainError("Bono no encontrado", "PACKAGE_NOT_FOUND", 404);
}

export const PATCH = apiHandler(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();
    await owned(admin.businessId, id);
    const data = updateSchema.parse(await request.json());

    const pkg = await prisma.package.update({ where: { id }, data });
    return NextResponse.json({ package: pkg });
  },
);

// Con compras asociadas se desactiva (los bonos vendidos siguen valiendo).
export const DELETE = apiHandler(
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const admin = await apiRequireBusinessAdmin();
    await owned(admin.businessId, id);

    const purchases = await prisma.clientPackage.count({
      where: { packageId: id },
    });
    if (purchases > 0) {
      const pkg = await prisma.package.update({
        where: { id },
        data: { active: false },
      });
      return NextResponse.json({ package: pkg, softDeleted: true });
    }

    await prisma.package.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  },
);
