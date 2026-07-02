import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Tokens de un solo uso (verificación de email, reset de contraseña,
// invitaciones). El token viaja en el enlace; en BD solo se guarda su hash,
// de modo que un volcado de la base de datos no permite usarlos.

export type AuthTokenType = "EMAIL_VERIFY" | "PASSWORD_RESET";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Crea un token nuevo e invalida los anteriores del mismo tipo.
export async function createAuthToken(
  userId: string,
  type: AuthTokenType,
  ttlMinutes: number,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");

  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, type } }),
    prisma.authToken.create({
      data: {
        userId,
        type,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      },
    }),
  ]);

  return token;
}

// Valida y consume el token (un solo uso). Devuelve el userId o null.
export async function consumeAuthToken(
  token: string,
  type: AuthTokenType,
): Promise<string | null> {
  const record = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (
    !record ||
    record.type !== type ||
    record.usedAt !== null ||
    record.expiresAt.getTime() < Date.now()
  ) {
    return null;
  }

  // updateMany con condición usedAt=null: si dos peticiones llegan a la vez,
  // solo una consume el token.
  const updated = await prisma.authToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return updated.count === 1 ? record.userId : null;
}
