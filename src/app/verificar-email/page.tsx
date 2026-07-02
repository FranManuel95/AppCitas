import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { consumeAuthToken } from "@/lib/auth/tokens";
import { audit } from "@/lib/audit";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verificar email" };

// Destino del enlace del email de verificación. Consumir el token aquí
// (en la carga de la página) es el patrón estándar de los enlaces de correo.
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let verified = false;
  if (token) {
    const userId = await consumeAuthToken(token, "EMAIL_VERIFY");
    if (userId) {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date() },
        select: { id: true, email: true },
      });
      await audit("EMAIL_VERIFIED", { userId: user.id, email: user.email });
      verified = true;
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-brand-100/70 to-transparent"
        />
        <div className="card relative w-full max-w-md p-6 text-center shadow-md sm:p-8">
          {verified ? (
            <>
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft">
                <CheckCircle2
                  className="h-7 w-7 text-success-strong"
                  aria-hidden
                />
              </span>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">
                Email verificado
              </h1>
              <p className="mt-2 text-sm text-ink-muted">
                Tu cuenta está confirmada. ¡Gracias!
              </p>
              <Link href="/" className="btn-primary mt-6 w-full">
                Ir a AppCitas
              </Link>
            </>
          ) : (
            <>
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft">
                <XCircle className="h-7 w-7 text-danger-strong" aria-hidden />
              </span>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">
                Enlace no válido
              </h1>
              <p className="mt-2 text-sm text-ink-muted">
                El enlace de verificación no es válido o ha caducado. Inicia
                sesión y solicita uno nuevo desde el aviso de verificación.
              </p>
              <Link href="/login" className="btn-primary mt-6 w-full">
                Iniciar sesión
              </Link>
            </>
          )}
        </div>
      </main>
    </>
  );
}
