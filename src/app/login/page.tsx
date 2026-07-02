import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays } from "lucide-react";
import { getDict } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Iniciar sesión" };

export default async function LoginPage() {
  const { t } = await getDict();
  return (
    <>
      <SiteHeader />
      <main className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-brand-100/70 to-transparent"
        />
        <div className="relative w-full max-w-md">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <CalendarDays className="h-5 w-5" aria-hidden />
            </span>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">
              {t.auth.loginTitle}
            </h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              {t.auth.loginSubtitle}
            </p>
          </div>
          <div className="card mt-6 p-6 shadow-md sm:p-8">
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
            <p className="mt-4 text-center text-sm">
              <Link
                href="/recuperar"
                className="font-medium text-brand-700 hover:underline"
              >
                {t.auth.forgotPassword}
              </Link>
            </p>
          </div>
          <p className="mt-6 text-center text-sm text-ink-muted">
            {t.auth.noAccount}{" "}
            <Link
              href="/register"
              className="font-medium text-brand-700 hover:underline"
            >
              {t.auth.registerLink}
            </Link>{" "}
            {t.auth.orText}{" "}
            <Link
              href="/register-business"
              className="font-medium text-brand-700 hover:underline"
            >
              {t.auth.registerBusinessLink}
            </Link>
            .
          </p>
        </div>
      </main>
    </>
  );
}
