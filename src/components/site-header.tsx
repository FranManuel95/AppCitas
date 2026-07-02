import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { getDict } from "@/lib/i18n";
import { ADMIN_ROLES } from "@/lib/domain/types";
import { buttonClasses } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { LogoutButton } from "./logout-button";
import { LanguageSwitcher } from "./language-switcher";
import { NavLink } from "./nav-link";

export async function SiteHeader() {
  const [user, { locale, t }] = await Promise.all([getSessionUser(), getDict()]);
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role) && !!user.businessId;
  const isStaff = user?.role === "STAFF" && !!user.businessId;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <CalendarDays className="h-5 w-5 text-brand-600" aria-hidden />
          <span className="font-serif text-lg tracking-tight text-ink">
            AppCitas
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          <LanguageSwitcher current={locale} />
          {user ? (
            <>
              {isAdmin ? (
                <NavLink href="/admin">{t.header.adminPanel}</NavLink>
              ) : isStaff ? (
                <NavLink href="/personal">{t.header.myAgenda}</NavLink>
              ) : (
                <NavLink href="/mis-citas">{t.header.myAppointments}</NavLink>
              )}
              <span
                aria-hidden
                className="hidden h-5 w-px bg-border sm:inline-block"
              />
              <span className="hidden items-center gap-2 sm:flex">
                <Avatar name={user.name} size="sm" />
                <span className="max-w-32 truncate text-sm text-ink-muted">
                  {user.name}
                </span>
              </span>
              <LogoutButton label={t.header.logout} />
            </>
          ) : (
            <>
              <NavLink href="/login">{t.header.login}</NavLink>
              <Link
                href="/register"
                className={buttonClasses({ variant: "primary", size: "sm" })}
              >
                {t.header.signup}
              </Link>
            </>
          )}
        </nav>
      </div>
      <div aria-hidden className="h-[3px] border-t border-border" />
    </header>
  );
}
