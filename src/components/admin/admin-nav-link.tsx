"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgePercent,
  Banknote,
  Bell,
  BookUser,
  Briefcase,
  CalendarDays,
  ClipboardList,
  Clock,
  CreditCard,
  Hourglass,
  LayoutDashboard,
  Megaphone,
  QrCode,
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
  clientes: BookUser,
  equipo: Users,
  servicios: Briefcase,
  promociones: BadgePercent,
  marketing: Megaphone,
  horario: Clock,
  notificaciones: Bell,
  espera: Hourglass,
  ajustes: Settings,
  plan: CreditCard,
  cobros: Banknote,
  qr: QrCode,
} satisfies Record<string, LucideIcon>;

export type AdminNavIcon = keyof typeof ICONS;

// Resolución de icono para otros navs (barra móvil) sin duplicar el mapa.
export function navIcon(icon: AdminNavIcon): LucideIcon {
  return ICONS[icon];
}

/** "/admin" solo activo con coincidencia exacta; el resto por prefijo. */
export function isNavActive(pathname: string, href: string): boolean {
  return href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(`${href}/`);
}

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
  const active = isNavActive(pathname, href);

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
