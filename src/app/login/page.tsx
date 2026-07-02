import Link from "next/link";
import { Suspense } from "react";
import { getDict } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Iniciar sesión" };

export default async function LoginPage() {
  const { t } = await getDict();
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="card w-full max-w-md">
          <h1 className="text-xl font-semibold text-slate-900">
            {t.auth.loginTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t.auth.loginSubtitle}</p>
          <div className="mt-6">
            <Suspense>
              <AuthForm
                endpoint="/api/auth/login"
                submitLabel={t.auth.loginButton}
                busyLabel={t.auth.submitBusy}
                errorFallback={t.auth.genericError}
                fields={[
                  {
                    name: "email",
                    label: t.auth.email,
                    type: "email",
                    autoComplete: "email",
                  },
                  {
                    name: "password",
                    label: t.auth.password,
                    type: "password",
                    autoComplete: "current-password",
                  },
                ]}
              />
            </Suspense>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            {t.auth.noAccount}{" "}
            <Link href="/register" className="text-indigo-600">
              {t.auth.registerLink}
            </Link>{" "}
            {t.auth.orText}{" "}
            <Link href="/register-business" className="text-indigo-600">
              {t.auth.registerBusinessLink}
            </Link>
            .
          </p>
          <p className="mt-2 text-sm text-slate-500">
            <Link href="/recuperar" className="text-indigo-600">
              {t.auth.forgotPassword}
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
