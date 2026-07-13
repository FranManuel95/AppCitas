import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";
import { prisma } from "@/lib/prisma";

// DELETE /api/admin/photos/[id] — quita una foto de la galería.
export const DELETE = apiHandler(
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const admin = await apiRequireBusinessAdmin();
    const { id } = await params;
    const photo = await prisma.businessPhoto.findFirst({
      where: { id, businessId: admin.businessId },
      select: { id: true },
    });
    if (!photo) {
      throw new DomainError("Foto no encontrada", "PHOTO_NOT_FOUND", 404);
    }
    await prisma.businessPhoto.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  },
);
