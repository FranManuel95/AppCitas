"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Enlace de navegación con estado activo según la ruta actual. */
export function NavLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active =
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-brand-50 text-brand-700"
          : "text-ink-soft hover:bg-surface-3 hover:text-ink",
        className,
      )}
    >
      {children}
    </Link>
  );
}
