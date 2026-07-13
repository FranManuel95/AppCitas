import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { verifyPassword } from "@/lib/auth/password";
import {
  consumeRecoveryCode,
  looksLikeRecoveryCode,
  verifyTotpCode,
} from "@/lib/auth/totp";
import { createSession } from "@/lib/auth/session";
import { DomainError } from "@/lib/domain/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import type { Role } from "@/lib/domain/types";

const schema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1),
  // Código de la app de autenticación O código de recuperación (XXXX-XXXX),
  // solo para cuentas con 2FA activo
  totpCode: z.string().max(12).optional(),
});

export const POST = apiHandler(async (request: Request) => {
  const { email, password, totpCode } = schema.parse(await request.json());

  // Frena la fuerza bruta de credenciales por IP+cuenta
  await enforceRateLimit(request, "login", { limit: 10, windowMs: 15 * 60_000 }, email);

  const user = await prisma.user.findUnique({ where: { email } });
  // Mismo error para email inexistente y contraseña errónea: no revela cuentas
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await audit("LOGIN_FAILED", { email, userId: user?.id, request });
    throw new DomainError("Credenciales incorrectas", "BAD_CREDENTIALS", 401);
  }

  // 2FA: la contraseña sola no basta si la cuenta tiene TOTP activo. El
  // formulario, al recibir TOTP_REQUIRED, pide el código y reintenta.
  if (user.totpEnabledAt && user.totpSecret) {
    if (!totpCode) {
      throw new DomainError(
        "Introduce el código de tu app de autenticación",
        "TOTP_REQUIRED",
        401,
      );
    }
    if (looksLikeRecoveryCode(totpCode)) {
      // Código de recuperación: un solo uso — al aceptarlo se elimina de la
      // lista y queda rastro en auditoría.
      const remaining = consumeRecoveryCode(totpCode, user.totpRecoveryCodes);
      if (remaining === null) {
        await audit("LOGIN_FAILED", { email, userId: user.id, request });
        throw new DomainError("Código 2FA no válido", "TOTP_BAD_CODE", 401);
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { totpRecoveryCodes: remaining },
      });
      await audit("TOTP_RECOVERY_USED", { userId: user.id, email, request });
    } else if (!verifyTotpCode(totpCode, user.totpSecret)) {
      await audit("LOGIN_FAILED", { email, userId: user.id, request });
      throw new DomainError("Código 2FA no válido", "TOTP_BAD_CODE", 401);
    }
  }

  await createSession(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
      businessId: user.businessId,
    },
    user.sessionVersion,
  );
  await audit("LOGIN_OK", { userId: user.id, email, request });

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      businessId: user.businessId,
    },
  });
});
