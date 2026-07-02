import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getDict } from "@/lib/i18n";
import { ADMIN_ROLES } from "@/lib/domain/types";
import { LogoutButton } from "./logout-button";
import { LanguageSwitcher } from "./language-switcher";

export async function SiteHeader() {
  const [user, { locale, t }] = await Promise.all([getSessionUser(), getDict()]);
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role) && !!user.businessId;
  const isStaff = user?.role === "STAFF" && !!user.businessId;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold text-indigo-600">
          AppCitas
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <LanguageSwitcher current={locale} />
          {user ? (
            <>
              {isAdmin ? (
                <Link
                  href="/admin"
                  className="font-medium text-slate-600 hover:text-slate-900"
                >
                  {t.header.adminPanel}
                </Link>
              ) : isStaff ? (
                <Link
                  href="/personal"
                  className="font-medium text-slate-600 hover:text-slate-900"
                >
                  {t.header.myAgenda}
                </Link>
              ) : (
                <Link
                  href="/mis-citas"
                  className="font-medium text-slate-600 hover:text-slate-900"
                >
                  {t.header.myAppointments}
                </Link>
              )}
              <span className="hidden text-slate-400 sm:inline">
                {user.name}
              </span>
              <LogoutButton label={t.header.logout} />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="font-medium text-slate-600 hover:text-slate-900"
              >
                {t.header.login}
              </Link>
              <Link href="/register" className="btn-primary">
                {t.header.signup}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
