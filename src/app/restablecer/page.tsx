import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata = { title: "Restablecer contraseña" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="card w-full max-w-md">
          <h1 className="text-xl font-semibold text-slate-900">
            Elegir contraseña
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Establece la contraseña de tu cuenta de AppCitas.
          </p>
          <div className="mt-6">
            {token ? (
              <ResetPasswordForm token={token} />
            ) : (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                Falta el token en el enlace.{" "}
                <Link href="/recuperar" className="font-medium underline">
                  Solicita uno nuevo
                </Link>
                .
              </p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
