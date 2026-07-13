import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";

const patchSchema = z.object({
  // "YYYY-MM-DD" o null para borrarla. Solo se usa mes y día (campañas de
  // cumpleaños), pero se guarda completa por si el cliente la aportó así.
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});

// PATCH /api/me — datos de perfil editables por el propio usuario.
export const PATCH = apiHandler(async (request: Request) => {
  const user = await apiRequireUser();
  const data = patchSchema.parse(await request.json());

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(data.birthDate !== undefined
        ? {
            birthDate: data.birthDate
              ? new Date(`${data.birthDate}T00:00:00.000Z`)
              : null,
          }
        : {}),
      ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
    },
    select: { id: true, birthDate: true, phone: true },
  });
  return NextResponse.json({
    birthDate: updated.birthDate?.toISOString().slice(0, 10) ?? null,
    phone: updated.phone,
  });
});
