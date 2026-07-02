import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { getDict } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata = { title: "Recuperar contraseña" };

export default async function ForgotPasswordPage() {
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
              {t.auth.forgotTitle}
            </h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              {t.auth.forgotSubtitle}
            </p>
          </div>
          <div className="card mt-6 p-6 shadow-md sm:p-8">
            <ForgotPasswordForm
              labels={{
                emailLabel: t.auth.forgotEmailLabel,
                button: t.auth.forgotButton,
                busy: t.auth.submitBusy,
                sent: t.auth.forgotSent,
                errorFallback: t.auth.genericError,
              }}
            />
          </div>
          <p className="mt-6 text-center text-sm">
            <Link
              href="/login"
              className="font-medium text-brand-700 hover:underline"
            >
              {t.auth.backToLogin}
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
