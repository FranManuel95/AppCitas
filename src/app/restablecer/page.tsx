import Link from "next/link";
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
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="card w-full max-w-md">
          <h1 className="text-xl font-semibold text-slate-900">
            {t.auth.resetTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t.auth.resetSubtitle}</p>
          <div className="mt-6">
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
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {t.auth.resetMissingToken}{" "}
                <Link href="/recuperar" className="font-medium underline">
                  {t.auth.requestNew}
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
