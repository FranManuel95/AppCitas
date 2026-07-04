"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgePercent,
  Bell,
  Briefcase,
  CalendarDays,
  ClipboardList,
  Clock,
  CreditCard,
  Hourglass,
  LayoutDashboard,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

/* Los iconos se resuelven aquí (cliente) porque un componente de icono no
   puede cruzar la frontera server→client como prop; el layout pasa la clave. */
const ICONS = {
  dashboard: LayoutDashboard,
  agenda: CalendarDays,
  citas: ClipboardList,
  equipo: Users,
  servicios: Briefcase,
  promociones: BadgePercent,
  horario: Clock,
  notificaciones: Bell,
  espera: Hourglass,
  ajustes: Settings,
  plan: CreditCard,
} satisfies Record<string, LucideIcon>;

export type AdminNavIcon = keyof typeof ICONS;

/**
 * Enlace del sidebar del panel admin con icono y estado activo según la ruta.
 * "/admin" solo se marca activo con coincidencia exacta para que el Dashboard
 * no quede resaltado en todas las subrutas.
 */
export function AdminNavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: AdminNavIcon;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const Icon = ICONS[icon];
  const active =
    href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-brand-50 font-medium text-brand-700"
          : "text-ink-soft hover:bg-surface-3 hover:text-ink",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          active ? "text-brand-600" : "text-ink-muted group-hover:text-ink-soft",
        )}
        aria-hidden
      />
      {children}
    </Link>
  );
}
