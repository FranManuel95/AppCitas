import Link from "next/link";
import { AlertCircle, CalendarDays } from "lucide-react";
import { getDict } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata = { title: "Restablecer contraseña" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ token }, { t }] = await Promise.all([searchParams, getDict()]);

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
              {t.auth.resetTitle}
            </h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              {t.auth.resetSubtitle}
            </p>
          </div>
          <div className="card mt-6 p-6 shadow-md sm:p-8">
            {token ? (
              <ResetPasswordForm
                token={token}
                labels={{
                  passwordLabel: t.auth.passwordNew,
                  repeatLabel: t.auth.resetRepeat,
                  button: t.auth.resetButton,
                  busy: t.auth.submitBusy,
                  done: t.auth.resetDone,
                  loginCta: t.auth.loginTitle,
                  mismatch: t.auth.resetMismatch,
                  errorFallback: t.auth.genericError,
                }}
              />
            ) : (
              <div className="flex items-start gap-2.5 rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger-strong">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>
                  {t.auth.resetMissingToken}{" "}
                  <Link href="/recuperar" className="font-medium underline">
                    {t.auth.requestNew}
                  </Link>
                  .
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
