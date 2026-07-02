import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  DICTIONARIES,
  LOCALES,
  LOCALE_COOKIE,
  type Dict,
  type Locale,
} from "./shared";

// Punto de entrada de servidor (usa cookies). Los componentes cliente deben
// importar desde "@/lib/i18n/shared" (diccionarios y tipos, sin next/headers).
export * from "./shared";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE;
}

export async function getDict(): Promise<{ locale: Locale; t: Dict }> {
  const locale = await getLocale();
  return { locale, t: DICTIONARIES[locale] };
}
