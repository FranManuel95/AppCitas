import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { consumeAuthToken } from "@/lib/auth/tokens";
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
      await prisma.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date() },
      });
      verified = true;
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="card w-full max-w-md text-center">
          {verified ? (
            <>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
                ✓
              </div>
              <h1 className="mt-4 text-xl font-semibold text-slate-900">
                Email verificado
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Tu cuenta está confirmada. ¡Gracias!
              </p>
              <Link href="/" className="btn-primary mt-6">
                Ir a AppCitas
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-slate-900">
                Enlace no válido
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                El enlace de verificación no es válido o ha caducado. Inicia
                sesión y solicita uno nuevo desde el aviso de verificación.
              </p>
              <Link href="/login" className="btn-primary mt-6">
                Iniciar sesión
              </Link>
            </>
          )}
        </div>
      </main>
    </>
  );
}
