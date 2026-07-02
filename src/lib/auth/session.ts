import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { ROLES, type Role } from "@/lib/domain/types";

// Sesión stateless: JWT firmado en cookie httpOnly. Sin estado en servidor,
// escala horizontalmente sin sesión compartida (sticky sessions/Redis).

const COOKIE_NAME = "appcitas_session";
const SESSION_DURATION_S = 60 * 60 * 24 * 7; // 7 días

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  businessId: string | null;
}

// El token lleva la versión de sesión del usuario al emitirse (claim "sv").
// Incrementarla (restablecer contraseña, "cerrar sesión en todos los
// dispositivos") invalida todos los JWT anteriores.

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET es obligatorio en producción");
    }
    return new TextEncoder().encode("appcitas-dev-secret-no-usar-en-produccion");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(
  user: SessionUser,
  sessionVersion = 0,
): Promise<void> {
  const token = await new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    businessId: user.businessId,
    sv: sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_S}s`)
    .sign(getSecret());

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DURATION_S,
    path: "/",
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = payload.role as string;
    if (!payload.sub || !ROLES.includes(role as Role)) return null;

    // Comprobación de revocación: la versión del token debe coincidir con la
    // del usuario (consulta por clave primaria; coste mínimo por petición).
    const tokenVersion = Number(payload.sv ?? 0);
    const { prisma } = await import("@/lib/prisma");
    const account = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { sessionVersion: true },
    });
    if (!account || account.sessionVersion !== tokenVersion) return null;

    return {
      id: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: role as Role,
      businessId: (payload.businessId as string | null) ?? null,
    };
  } catch {
    return null; // token caducado o manipulado
  }
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
