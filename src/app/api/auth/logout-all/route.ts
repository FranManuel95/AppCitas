import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";
import { destroySession } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

// POST /api/auth/logout-all — revoca todas las sesiones del usuario en todos
// los dispositivos incrementando su versión de sesión (los JWT emitidos
// dejan de validar). También cierra la sesión actual.
export const POST = apiHandler(async (request: Request) => {
  const user = await apiRequireUser();

  await prisma.user.update({
    where: { id: user.id },
    data: { sessionVersion: { increment: 1 } },
  });
  await destroySession();
  await audit("SESSIONS_REVOKED", {
    userId: user.id,
    email: user.email,
    request,
  });

  return NextResponse.json({ ok: true });
});
