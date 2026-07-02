import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { LOCALES, LOCALE_COOKIE } from "@/lib/i18n";

const schema = z.object({ locale: z.enum(LOCALES) });

// POST /api/locale — cambia el idioma de la interfaz (cookie de un año).
export const POST = apiHandler(async (request: Request) => {
  const { locale } = schema.parse(await request.json());
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return NextResponse.json({ ok: true, locale });
});
