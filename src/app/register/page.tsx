import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="card w-full max-w-md">
          <h1 className="text-xl font-semibold text-slate-900">
            Crear cuenta de cliente
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Para reservar citas en cualquier negocio de la plataforma.
          </p>
          <div className="mt-6">
            <Suspense>
              <AuthForm
                endpoint="/api/auth/register"
                submitLabel="Crear cuenta"
                fields={[
                  { name: "name", label: "Nombre completo" },
                  {
                    name: "email",
                    label: "Email",
                    type: "email",
                    autoComplete: "email",
                  },
                  {
                    name: "password",
                    label: "Contraseña (mínimo 8 caracteres)",
                    type: "password",
                    autoComplete: "new-password",
                  },
                  {
                    name: "phone",
                    label: "Teléfono (opcional)",
                    type: "tel",
                    required: false,
                  },
                ]}
              />
            </Suspense>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            ¿Tienes un negocio?{" "}
            <Link href="/register-business" className="text-indigo-600">
              Regístralo aquí
            </Link>
            .
          </p>
        </div>
      </main>
    </>
  );
}
