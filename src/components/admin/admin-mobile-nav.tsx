"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutGrid, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  isNavActive,
  navIcon,
  type AdminNavIcon,
} from "@/components/admin/admin-nav-link";

export interface MobileNavItem {
  href: string;
  label: string;
  icon: AdminNavIcon;
}
export interface MobileNavSection {
  title: string;
  items: MobileNavItem[];
}

// Barra inferior del panel en móvil: 4 destinos de uso diario + "Más" (hoja
// con todas las secciones). Sustituye a la antigua tira con scroll lateral en
// la que la mitad de los ítems quedaban fuera de pantalla.
const PRIMARY_HREFS = ["/admin", "/admin/agenda", "/admin/citas", "/admin/clientes"];

export function AdminMobileNav({
  sections,
  moreLabel,
}: {
  sections: MobileNavSection[];
  moreLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // La hoja se cierra sola al navegar (y no se queda abierta al volver atrás)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const allItems = sections.flatMap((s) => s.items);
  const primary = PRIMARY_HREFS.map(
    (href) => allItems.find((i) => i.href === href)!,
  ).filter(Boolean);
  // "Más" queda resaltado cuando la página activa no está en la barra
  const moreActive =
    open || !primary.some((i) => isNavActive(pathname, i.href));

  return (
    <>
      {/* Hoja con todas las secciones */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal>
          <button
            type="button"
            aria-label={moreLabel}
            className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">{moreLabel}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-3"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {sections.map((section) => (
              <div key={section.title} className="mt-3 first:mt-0">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  {section.title}
                </p>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {section.items.map((item) => {
                    const Icon = navIcon(item.icon);
                    const active = isNavActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-xs transition-colors",
                          active
                            ? "border-brand-200 bg-brand-50 font-medium text-brand-700"
                            : "border-border text-ink-soft hover:bg-surface-3",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-5 w-5",
                            active ? "text-brand-600" : "text-ink-muted",
                          )}
                          aria-hidden
                        />
                        <span className="line-clamp-1">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barra inferior fija */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur md:hidden">
        <ul className="mx-auto flex max-w-xl items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
          {primary.map((item) => {
            const Icon = navIcon(item.icon);
            const active = isNavActive(pathname, item.href);
            return (
              <li key={item.href} className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-1 py-2 text-[11px]",
                    active ? "font-medium text-brand-700" : "text-ink-muted",
                  )}
                >
                  <Icon
                    className={cn("h-5 w-5", active && "text-brand-600")}
                    aria-hidden
                  />
                  <span className="line-clamp-1">{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn(
                "flex w-full flex-col items-center gap-0.5 px-1 py-2 text-[11px]",
                moreActive ? "font-medium text-brand-700" : "text-ink-muted",
              )}
            >
              <LayoutGrid
                className={cn("h-5 w-5", moreActive && "text-brand-600")}
                aria-hidden
              />
              <span>{moreLabel}</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
