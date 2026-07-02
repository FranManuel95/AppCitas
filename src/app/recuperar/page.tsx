import Link from "next/link";
import { getDict } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata = { title: "Recuperar contraseña" };

export default async function ForgotPasswordPage() {
  const { t } = await getDict();
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="card w-full max-w-md">
          <h1 className="text-xl font-semibold text-slate-900">
            {t.auth.forgotTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t.auth.forgotSubtitle}</p>
          <div className="mt-6">
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
          <p className="mt-4 text-sm text-slate-500">
            <Link href="/login" className="text-indigo-600">
              {t.auth.backToLogin}
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
