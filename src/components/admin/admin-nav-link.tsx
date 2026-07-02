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
  ajustes: Settings,
} satisfies Record<string, LucideIcon>;

export type AdminNavIcon = keyof typeof ICONS;

/**
 * Pestaña de la barra superior del panel admin con icono y estado activo
 * según la ruta: la activa se marca con un borde inferior de 2px en color de
 * marca, sin fondo. "/admin" solo se marca activa con coincidencia exacta
 * para que el Dashboard no quede resaltado en todas las subrutas.
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
        "group flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
        active
          ? "border-brand-600 font-medium text-ink"
          : "border-transparent text-ink-soft hover:text-ink",
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
