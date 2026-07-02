import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="card w-full max-w-md">
          <h1 className="text-xl font-semibold text-slate-900">
            Iniciar sesión
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Accede a tus citas o al panel de tu negocio.
          </p>
          <div className="mt-6">
            <Suspense>
              <AuthForm
                endpoint="/api/auth/login"
                submitLabel="Entrar"
                fields={[
                  {
                    name: "email",
                    label: "Email",
                    type: "email",
                    autoComplete: "email",
                  },
                  {
                    name: "password",
                    label: "Contraseña",
                    type: "password",
                    autoComplete: "current-password",
                  },
                ]}
              />
            </Suspense>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="text-indigo-600">
              Regístrate
            </Link>{" "}
            o{" "}
            <Link href="/register-business" className="text-indigo-600">
              da de alta tu negocio
            </Link>
            .
          </p>
        </div>
      </main>
    </>
  );
}
