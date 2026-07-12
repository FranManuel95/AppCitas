import Link from "next/link";
import { CalendarDays, CreditCard, ExternalLink, LogOut, Ban } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getDict } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n/shared";
import { LogoutButton } from "@/components/logout-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { Avatar } from "@/components/ui/avatar";
import {
  AdminNavLink,
  type AdminNavIcon,
} from "@/components/admin/admin-nav-link";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";

// El icono va como clave (no como componente): las funciones no pueden
// cruzar la frontera server→client; AdminNavLink resuelve la clave. Con 15
// destinos, el nav va agrupado en secciones (y en móvil, barra inferior +
// hoja "Más"). Algunas etiquetas van literales: el diccionario admin.nav no
// tiene clave para esas secciones nuevas.
function buildNav(
  nav: Dict["admin"]["nav"],
): Array<{
  title: string;
  items: Array<{ href: string; label: string; icon: AdminNavIcon }>;
}> {
  return [
    {
      title: nav.groupActivity,
      items: [
        { href: "/admin", label: nav.dashboard, icon: "dashboard" },
        { href: "/admin/agenda", label: nav.agenda, icon: "agenda" },
        { href: "/admin/citas", label: nav.citas, icon: "citas" },
      ],
    },
    {
      title: nav.groupClients,
      items: [
        { href: "/admin/clientes", label: "Clientes", icon: "clientes" },
        { href: "/admin/lista-espera", label: "Lista de espera", icon: "espera" },
        { href: "/admin/marketing", label: "Marketing", icon: "marketing" },
      ],
    },
    {
      title: nav.groupBusiness,
      items: [
        { href: "/admin/servicios", label: nav.servicios, icon: "servicios" },
        { href: "/admin/equipo", label: nav.equipo, icon: "equipo" },
        { href: "/admin/promociones", label: nav.promos, icon: "promociones" },
        { href: "/admin/horario", label: nav.horario, icon: "horario" },
      ],
    },
    {
      title: nav.groupSettings,
      items: [
        { href: "/admin/ajustes", label: nav.ajustes, icon: "ajustes" },
        {
          href: "/admin/notificaciones",
          label: nav.notificaciones,
          icon: "notificaciones",
        },
        { href: "/admin/cobros", label: "Cobros", icon: "cobros" },
        { href: "/admin/qr", label: "Código QR", icon: "qr" },
        { href: "/admin/plan", label: "Plan", icon: "plan" },
      ],
    },
  ];
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireBusinessAdmin();
  const [business, account, { locale, t }] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: admin.businessId },
      select: { name: true, slug: true, active: true },
    }),
    prisma.user.findUnique({
      where: { id: admin.id },
      select: { emailVerifiedAt: true },
    }),
    getDict(),
  ]);
  const nav = buildNav(t.admin.nav);

  return (
    <div className="flex min-h-screen flex-col bg-surface-2 md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-border bg-surface md:sticky md:top-0 md:h-screen md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2.5 px-5 pb-3 pt-4 md:pb-4 md:pt-5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-xs">
            <CalendarDays className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <Link
              href="/"
              className="block text-sm font-semibold tracking-tight text-ink transition-colors hover:text-brand-700"
            >
              AppCitas
            </Link>
            <p className="truncate text-xs text-ink-muted">{business.name}</p>
          </div>
        </div>

        <nav className="hidden min-h-0 md:block md:flex-1 md:overflow-y-auto">
          {nav.map((section) => (
            <div key={section.title} className="px-3 py-1.5">
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <AdminNavLink href={item.href} icon={item.icon}>
                      {item.label}
                    </AdminNavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border px-3 py-2 md:block md:py-3">
          <Link
            href={`/b/${business.slug}`}
            className="group flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <ExternalLink
              className="h-4 w-4 shrink-0 text-ink-muted group-hover:text-ink-soft"
              aria-hidden
            />
            {t.admin.layout.viewPublicPage}
          </Link>
          <div className="flex items-center gap-3 px-3 py-1 md:mt-1 md:justify-between md:py-2">
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={admin.name} size="sm" />
              <span className="hidden max-w-28 truncate text-sm text-ink-muted sm:inline">
                {admin.name}
              </span>
            </span>
            <LanguageSwitcher current={locale} />
            <span className="flex shrink-0 items-center gap-1.5">
              <LogOut className="h-4 w-4 text-ink-muted" aria-hidden />
              <LogoutButton label={t.admin.common.logout} />
            </span>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 bg-surface-2 px-4 py-6 pb-24 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-6xl">
          {account && !account.emailVerifiedAt && (
            <VerifyEmailBanner email={admin.email} />
          )}
          {!business.active && (
            <div
              role="alert"
              className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-strong"
            >
              <span className="flex min-w-0 items-start gap-2.5">
                <Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>
                  Tu negocio está suspendido. No puedes hacer cambios ni recibir
                  reservas hasta reactivarlo. Regulariza tu suscripción para
                  volver a operar.
                </p>
              </span>
              <Link
                href="/admin/plan"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-danger/40 bg-surface px-3 py-1.5 text-xs font-medium text-danger-strong shadow-xs transition-colors hover:border-danger/70"
              >
                <CreditCard className="h-3.5 w-3.5" aria-hidden />
                Ir a mi plan
              </Link>
            </div>
          )}
          {children}
        </div>
      </main>

      {/* Barra de navegación inferior (solo móvil) */}
      <AdminMobileNav sections={nav} moreLabel={t.admin.nav.more} />
    </div>
  );
}
