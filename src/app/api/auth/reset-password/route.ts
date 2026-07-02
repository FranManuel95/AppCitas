import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { consumeAuthToken } from "@/lib/auth/tokens";
import { DomainError } from "@/lib/domain/errors";
import { enforceRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(100),
});

// POST /api/auth/reset-password — canjea el token de un solo uso.
// También completa las invitaciones de empleados (mismo mecanismo).
export const POST = apiHandler(async (request: Request) => {
  enforceRateLimit(request, "reset-password", {
    limit: 10,
    windowMs: 15 * 60_000,
  });
  const { token, password } = schema.parse(await request.json());

  const userId = await consumeAuthToken(token, "PASSWORD_RESET");
  if (!userId) {
    throw new DomainError(
      "El enlace no es válido o ha caducado. Solicita uno nuevo.",
      "INVALID_TOKEN",
      400,
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      // Llegar al email demuestra su propiedad: cuenta como verificación
      emailVerifiedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
});
