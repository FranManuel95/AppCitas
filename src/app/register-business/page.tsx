import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Registrar negocio" };

export default function RegisterBusinessPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="card w-full max-w-md">
          <h1 className="text-xl font-semibold text-slate-900">
            Da de alta tu negocio
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cualquier sector: consultas, peluquerías, clínicas, talleres…
            Configura servicios, horario y política de cancelación desde el
            panel.
          </p>
          <div className="mt-6">
            <Suspense>
              <AuthForm
                endpoint="/api/auth/register-business"
                submitLabel="Crear negocio"
                adminRedirect
                fields={[
                  { name: "businessName", label: "Nombre del negocio" },
                  {
                    name: "category",
                    label: "Sector (opcional)",
                    required: false,
                    placeholder: "general, belleza, salud…",
                  },
                  { name: "ownerName", label: "Tu nombre" },
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
            ¿Buscas reservar una cita?{" "}
            <Link href="/register" className="text-indigo-600">
              Crea una cuenta de cliente
            </Link>
            .
          </p>
        </div>
      </main>
    </>
  );
}
