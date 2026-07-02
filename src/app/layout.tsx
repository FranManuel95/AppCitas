import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${GeistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
