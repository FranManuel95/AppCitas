import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { LogoutButton } from "@/components/logout-button";

// Chrome propio de la plataforma: el super-admin no pertenece a ningún negocio,
// así que NO reutiliza el layout de /admin (que depende de un businessId).
export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin();

  return (
    <div className="flex min-h-screen flex-col bg-surface-2">
      <header className="sticky top-0 z-10 border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
          <Link
            href="/superadmin"
            className="group flex items-center gap-2.5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-xs">
              <ShieldCheck className="h-4 w-4" aria-hidden />
            </span>
            <span className="text-sm font-semibold tracking-tight text-ink transition-colors group-hover:text-brand-700">
              AppCitas <span className="font-normal text-ink-muted">· Plataforma</span>
            </span>
          </Link>
          <span className="flex shrink-0 items-center gap-1.5">
            <LogOut className="h-4 w-4 text-ink-muted" aria-hidden />
            <LogoutButton label="Salir" />
          </span>
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
