import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AppCitas — Agenda de citas para tu negocio",
    template: "%s · AppCitas",
  },
  description:
    "Plataforma genérica de agendación de citas: tus clientes reservan online y tú gestionas agenda, ingresos y estadísticas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
