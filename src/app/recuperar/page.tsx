import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata = { title: "Recuperar contraseña" };

export default function ForgotPasswordPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="card w-full max-w-md">
          <h1 className="text-xl font-semibold text-slate-900">
            Recuperar contraseña
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Te enviaremos un enlace para elegir una contraseña nueva.
          </p>
          <div className="mt-6">
            <ForgotPasswordForm />
          </div>
          <p className="mt-4 text-sm text-slate-500">
            <Link href="/login" className="text-indigo-600">
              ← Volver a iniciar sesión
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
