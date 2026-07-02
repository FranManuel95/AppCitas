import Link from "next/link";
import { Suspense } from "react";
import { getDict } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Crear cuenta" };

export default async function RegisterPage() {
  const { t } = await getDict();
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="card w-full max-w-md">
          <h1 className="text-xl font-semibold text-slate-900">
            {t.auth.registerTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t.auth.registerSubtitle}
          </p>
          <div className="mt-6">
            <Suspense>
              <AuthForm
                endpoint="/api/auth/register"
                submitLabel={t.auth.registerButton}
                busyLabel={t.auth.submitBusy}
                errorFallback={t.auth.genericError}
                fields={[
                  { name: "name", label: t.auth.fullName },
                  {
                    name: "email",
                    label: t.auth.email,
                    type: "email",
                    autoComplete: "email",
                  },
                  {
                    name: "password",
                    label: t.auth.passwordNew,
                    type: "password",
                    autoComplete: "new-password",
                  },
                  {
                    name: "phone",
                    label: t.auth.phoneOptional,
                    type: "tel",
                    required: false,
                  },
                ]}
              />
            </Suspense>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            {t.auth.haveBusiness}{" "}
            <Link href="/register-business" className="text-indigo-600">
              {t.auth.registerBusinessHere}
            </Link>
            .
          </p>
        </div>
      </main>
    </>
  );
}
