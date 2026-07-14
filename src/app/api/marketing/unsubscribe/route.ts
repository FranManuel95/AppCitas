import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/marketing-token";
import { DomainError } from "@/lib/domain/errors";

const bodySchema = z.object({ token: z.string().min(10).max(200) });

// POST /api/marketing/unsubscribe — baja de comunicaciones comerciales por
// token firmado (sin sesión: el enlace del email debe funcionar siempre).
export const POST = apiHandler(async (request: Request) => {
  const { token } = bodySchema.parse(await request.json());
  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    throw new DomainError("Enlace de baja no válido", "UNSUB_INVALID", 400);
  }
  // updateMany: si la cuenta ya no existe, la baja es un no-op silencioso
  await prisma.user.updateMany({
    where: { id: userId },
    data: { marketingConsent: false },
  });
  return NextResponse.json({ ok: true });
});
