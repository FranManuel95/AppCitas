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
        "px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] transition-colors",
        active
          ? "text-brand-700 underline decoration-1 underline-offset-8"
          : "text-ink-soft hover:text-ink",
        className,
      )}
    >
      {children}
    </Link>
  );
}
