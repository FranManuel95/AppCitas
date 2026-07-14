import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { LOCALES, LOCALE_COOKIE } from "@/lib/i18n";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const schema = z.object({ locale: z.enum(LOCALES) });

// POST /api/locale — cambia el idioma de la interfaz (cookie de un año).
// Con sesión, además persiste la preferencia en la cuenta: las notificaciones
// por defecto (email/SMS/WhatsApp) salen en ese idioma.
export const POST = apiHandler(async (request: Request) => {
  const { locale } = schema.parse(await request.json());
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  const session = await getSessionUser().catch(() => null);
  if (session) {
    await prisma.user
      .updateMany({ where: { id: session.id }, data: { locale } })
      .catch(() => {});
  }
  return NextResponse.json({ ok: true, locale });
});
