import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";
import {
  generateTotpSecret,
  totpKeyUri,
  verifyTotpCode,
} from "@/lib/auth/totp";
import { DomainError } from "@/lib/domain/errors";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

const codeSchema = z.object({ code: z.string().min(6).max(8) });

// GET — estado del 2FA de la cuenta
export const GET = apiHandler(async () => {
  const user = await apiRequireUser();
  const row = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { totpEnabledAt: true },
  });
  return NextResponse.json({ enabled: !!row.totpEnabledAt });
});

// POST — inicia la activación: genera el secreto (PENDIENTE hasta verificar)
// y devuelve el QR para la app de autenticación.
export const POST = apiHandler(async () => {
  const user = await apiRequireUser();
  const row = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { totpEnabledAt: true },
  });
  if (row.totpEnabledAt) {
    throw new DomainError("El 2FA ya está activado", "TOTP_ALREADY_ON", 409);
  }

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: secret, totpEnabledAt: null },
  });
  const uri = totpKeyUri(user.email, secret);
  const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, width: 200 });
  return NextResponse.json({ secret, uri, qrSvg });
});

// PUT — confirma la activación con un código válido de la app
export const PUT = apiHandler(async (request: Request) => {
  const user = await apiRequireUser();
  await enforceUserRateLimit(user.id, "totp-verify", {
    limit: 10,
    windowMs: 15 * 60_000,
  });
  const { code } = codeSchema.parse(await request.json());

  const row = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { totpSecret: true, totpEnabledAt: true },
  });
  if (!row.totpSecret) {
    throw new DomainError("Inicia primero la activación", "TOTP_NOT_STARTED", 409);
  }
  if (!verifyTotpCode(code, row.totpSecret)) {
    throw new DomainError("Código no válido", "TOTP_BAD_CODE", 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabledAt: new Date() },
  });
  await audit("TOTP_ENABLED", { userId: user.id, email: user.email, request });
  return NextResponse.json({ enabled: true });
});

// DELETE — desactiva el 2FA (exige un código válido, no solo la sesión)
export const DELETE = apiHandler(async (request: Request) => {
  const user = await apiRequireUser();
  await enforceUserRateLimit(user.id, "totp-verify", {
    limit: 10,
    windowMs: 15 * 60_000,
  });
  const { code } = codeSchema.parse(await request.json());

  const row = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { totpSecret: true, totpEnabledAt: true },
  });
  if (!row.totpEnabledAt || !row.totpSecret) {
    throw new DomainError("El 2FA no está activado", "TOTP_NOT_ON", 409);
  }
  if (!verifyTotpCode(code, row.totpSecret)) {
    throw new DomainError("Código no válido", "TOTP_BAD_CODE", 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: null, totpEnabledAt: null },
  });
  await audit("TOTP_DISABLED", { userId: user.id, email: user.email, request });
  return NextResponse.json({ enabled: false });
});
