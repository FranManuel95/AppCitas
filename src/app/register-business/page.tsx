import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays } from "lucide-react";
import { getDict } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Registrar negocio" };

export default async function RegisterBusinessPage() {
  const { t } = await getDict();
  return (
    <>
      <SiteHeader />
      <main className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-brand-100/70 to-transparent"
        />
        <div className="relative w-full max-w-lg">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <CalendarDays className="h-5 w-5" aria-hidden />
            </span>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">
              {t.auth.businessTitle}
            </h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              {t.auth.businessSubtitle}
            </p>
          </div>
          <div className="card mt-6 p-6 shadow-md sm:p-8">
            <Suspense>
              <AuthForm
                endpoint="/api/auth/register-business"
                submitLabel={t.auth.businessButton}
                busyLabel={t.auth.submitBusy}
                errorFallback={t.auth.genericError}
                consent={
                  <>
                    {t.auth.consentPrefix}{" "}
                    <Link
                      href="/legal/privacidad"
                      className="font-medium text-brand-300 underline hover:text-brand-200"
                      target="_blank"
                    >
                      {t.auth.privacyPolicy}
                    </Link>{" "}
                    {t.auth.consentAnd}{" "}
                    <Link
                      href="/legal/terminos"
                      className="font-medium text-brand-300 underline hover:text-brand-200"
                      target="_blank"
                    >
                      {t.auth.termsOfUse}
                    </Link>
                  </>
                }
                adminRedirect
                fields={[
                  { name: "businessName", label: t.auth.businessName },
                  {
                    name: "category",
                    label: t.auth.businessCategory,
                    required: false,
                    placeholder: t.auth.businessCategoryPlaceholder,
                  },
                  { name: "ownerName", label: t.auth.yourName },
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
          <p className="mt-6 text-center text-sm text-ink-muted">
            {t.auth.lookingToBook}{" "}
            <Link
              href="/register"
              className="font-medium text-brand-300 hover:underline"
            >
              {t.auth.createClientAccount}
            </Link>
            .
          </p>
        </div>
      </main>
    </>
  );
}
