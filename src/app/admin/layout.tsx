import Link from "next/link";
import { ExternalLink, LogOut } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { LogoutButton } from "@/components/logout-button";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { Avatar } from "@/components/ui/avatar";
import {
  AdminNavLink,
  type AdminNavIcon,
} from "@/components/admin/admin-nav-link";

// El icono va como clave (no como componente): las funciones no pueden
// cruzar la frontera server→client; AdminNavLink resuelve la clave.
const NAV: Array<{ href: string; label: string; icon: AdminNavIcon }> = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/agenda", label: "Agenda", icon: "agenda" },
  { href: "/admin/citas", label: "Citas", icon: "citas" },
  { href: "/admin/equipo", label: "Equipo", icon: "equipo" },
  { href: "/admin/servicios", label: "Servicios", icon: "servicios" },
  { href: "/admin/promociones", label: "Promos", icon: "promociones" },
  { href: "/admin/horario", label: "Horario", icon: "horario" },
  { href: "/admin/notificaciones", label: "Notificaciones", icon: "notificaciones" },
  { href: "/admin/ajustes", label: "Ajustes", icon: "ajustes" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireBusinessAdmin();
  const [business, account] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: admin.businessId },
      select: { name: true, slug: true },
    }),
    prisma.user.findUnique({
      where: { id: admin.id },
      select: { emailVerifiedAt: true },
    }),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-surface-2">
      {/* Cabecera editorial de dos niveles: cabecera de revista + pestañas. */}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pb-2 pt-4 md:px-8">
          <div className="flex min-w-0 items-baseline gap-x-3">
            <Link
              href="/"
              className="shrink-0 font-serif text-xl font-semibold tracking-tight text-ink transition-colors hover:text-brand-700"
            >
              AppCitas
            </Link>
            <span className="truncate text-sm text-ink-muted">
              {business.name}
            </span>
          </div>

          <div className="flex min-w-0 items-center gap-x-4 sm:gap-x-5">
            <Link
              href={`/b/${business.slug}`}
              className="group flex shrink-0 items-center gap-1.5 text-sm text-ink-soft underline decoration-border-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink-soft"
            >
              <ExternalLink
                className="h-4 w-4 shrink-0 text-ink-muted group-hover:text-ink-soft"
                aria-hidden
              />
              Ver página pública
            </Link>
            <span className="flex min-w-0 items-center gap-2 border-l border-border pl-4 sm:pl-5">
              <Avatar name={admin.name} size="sm" />
              <span className="hidden max-w-28 truncate text-sm text-ink-muted sm:inline">
                {admin.name}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <LogOut className="h-4 w-4 text-ink-muted" aria-hidden />
              <LogoutButton />
            </span>
          </div>
        </div>

        <nav className="mx-auto w-full max-w-6xl px-4 md:px-8">
          {/* -mb-px: el borde activo de 2px pisa la regla fina de la cabecera. */}
          <ul className="-mb-px flex items-center gap-1 overflow-x-auto">
            {NAV.map((item) => (
              <li key={item.href} className="shrink-0">
                <AdminNavLink href={item.href} icon={item.icon}>
                  {item.label}
                </AdminNavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="min-w-0 flex-1 bg-surface-2 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-6xl">
          {account && !account.emailVerifiedAt && (
            <VerifyEmailBanner email={admin.email} />
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
