import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { DomainError } from "@/lib/domain/errors";
import { prisma } from "@/lib/prisma";

const MAX_PHOTOS = 12;

const createSchema = z.object({
  url: z.url().startsWith("https://").max(300),
  caption: z.string().trim().max(120).nullable().optional(),
});

// POST /api/admin/photos — añade una foto a la galería "Trabajos" (URL
// externa https, mismas reglas que el logo; la app no almacena archivos).
export const POST = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const input = createSchema.parse(await request.json());

  const count = await prisma.businessPhoto.count({
    where: { businessId: admin.businessId },
  });
  if (count >= MAX_PHOTOS) {
    throw new DomainError(
      `La galería admite ${MAX_PHOTOS} fotos como máximo`,
      "GALLERY_FULL",
      422,
    );
  }
  const photo = await prisma.businessPhoto.create({
    data: {
      businessId: admin.businessId,
      url: input.url,
      caption: input.caption ?? null,
      position: count,
    },
  });
  return NextResponse.json({ photo }, { status: 201 });
});
