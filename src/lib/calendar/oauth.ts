import { jwtVerify, SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { DomainError } from "@/lib/domain/errors";
import {
  assertCalendarSimulationAllowed,
  exchangeCode,
  isCalendarConfigured,
} from "./google";

// Flujo OAuth de conexión de calendario (dueño y empleado). El `state` es un
// JWT firmado con AUTH_SECRET (exp 10 min) que fija QUIÉN inició el flujo
// ({sub, businessId, staffId?}) y se verifica contra la sesión en el
// callback: nadie puede completar una conexión iniciada por otro.

function secret(): Uint8Array {
  const value =
    process.env.AUTH_SECRET ?? "appcitas-dev-secret-no-usar-en-produccion";
  return new TextEncoder().encode(value);
}

export function baseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export interface CalendarOAuthState {
  sub: string; // userId que inició el flujo
  businessId: string;
  staffId?: string;
}

export async function signCalendarState(
  state: CalendarOAuthState,
): Promise<string> {
  return new SignJWT({ businessId: state.businessId, staffId: state.staffId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(state.sub)
    .setAudience("calendar-oauth")
    .setExpirationTime("10m")
    .setIssuedAt()
    .sign(secret());
}

export async function verifyCalendarState(
  token: string,
): Promise<CalendarOAuthState> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      audience: "calendar-oauth",
    });
    if (!payload.sub || typeof payload.businessId !== "string") {
      throw new Error("payload incompleto");
    }
    return {
      sub: payload.sub,
      businessId: payload.businessId,
      staffId: typeof payload.staffId === "string" ? payload.staffId : undefined,
    };
  } catch {
    throw new DomainError(
      "El enlace de conexión caducó: inténtalo de nuevo",
      "CALENDAR_STATE_INVALID",
      400,
    );
  }
}

/** Crea/actualiza la conexión (staffId null = nivel negocio). */
export async function saveConnection(params: {
  businessId: string;
  staffId: string | null;
  googleEmail: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}): Promise<void> {
  const data = {
    googleEmail: params.googleEmail,
    accessTokenEnc: encryptSecret(params.accessToken),
    refreshTokenEnc: encryptSecret(params.refreshToken),
    accessTokenExpiresAt: params.expiresAt,
    status: "active",
    lastError: null,
    simulated: false,
  };
  const existing = await prisma.calendarConnection.findFirst({
    where: { businessId: params.businessId, staffId: params.staffId },
    select: { id: true },
  });
  if (existing) {
    await prisma.calendarConnection.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.calendarConnection.create({
      data: { businessId: params.businessId, staffId: params.staffId, ...data },
    });
  }
}

/** Conexión simulada en desarrollo (sin claves de Google). */
export async function createSimulatedConnection(params: {
  businessId: string;
  staffId: string | null;
}): Promise<void> {
  assertCalendarSimulationAllowed();
  const existing = await prisma.calendarConnection.findFirst({
    where: { businessId: params.businessId, staffId: params.staffId },
    select: { id: true },
  });
  const data = {
    googleEmail: "calendario@simulado.dev",
    accessTokenEnc: encryptSecret("dev"),
    refreshTokenEnc: encryptSecret("dev"),
    accessTokenExpiresAt: null,
    status: "active",
    lastError: null,
    simulated: true,
  };
  if (existing) {
    await prisma.calendarConnection.update({ where: { id: existing.id }, data });
  } else {
    await prisma.calendarConnection.create({
      data: { businessId: params.businessId, staffId: params.staffId, ...data },
    });
  }
}

/**
 * Completa el callback: intercambia el código y guarda la conexión.
 * Devuelve el email conectado.
 */
export async function completeCallback(params: {
  code: string;
  state: CalendarOAuthState;
  redirectUri: string;
}): Promise<string> {
  if (!isCalendarConfigured()) {
    throw new DomainError(
      "Google Calendar no está configurado",
      "CALENDAR_NOT_CONFIGURED",
      501,
    );
  }
  const tokens = await exchangeCode(params.code, params.redirectUri);
  if (!tokens.refreshToken) {
    throw new DomainError(
      "Google no devolvió permiso permanente: repite la conexión",
      "CALENDAR_NO_REFRESH_TOKEN",
      502,
    );
  }
  await saveConnection({
    businessId: params.state.businessId,
    staffId: params.state.staffId ?? null,
    googleEmail: tokens.email ?? "(sin email)",
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  });
  return tokens.email ?? "";
}
