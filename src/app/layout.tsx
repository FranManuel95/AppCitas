import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { getLocale } from "@/lib/i18n";
import { SwRegister } from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL ?? "http://localhost:3000"),
  title: {
    default: "AppCitas — Agenda de citas para tu negocio",
    template: "%s · AppCitas",
  },
  description:
    "Plataforma genérica de agendación de citas: tus clientes reservan online y tú gestionas agenda, ingresos y estadísticas.",
};

export const viewport: Viewport = {
  themeColor: "#5b3fd6",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${GeistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
