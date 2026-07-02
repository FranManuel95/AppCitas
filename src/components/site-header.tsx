import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/domain/types";
import { LogoutButton } from "./logout-button";

export async function SiteHeader() {
  const user = await getSessionUser();
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role) && !!user.businessId;
  const isStaff = user?.role === "STAFF" && !!user.businessId;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold text-indigo-600">
          AppCitas
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              {isAdmin ? (
                <Link
                  href="/admin"
                  className="font-medium text-slate-600 hover:text-slate-900"
                >
                  Panel del negocio
                </Link>
              ) : isStaff ? (
                <Link
                  href="/personal"
                  className="font-medium text-slate-600 hover:text-slate-900"
                >
                  Mi agenda
                </Link>
              ) : (
                <Link
                  href="/mis-citas"
                  className="font-medium text-slate-600 hover:text-slate-900"
                >
                  Mis citas
                </Link>
              )}
              <span className="hidden text-slate-400 sm:inline">
                {user.name}
              </span>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="font-medium text-slate-600 hover:text-slate-900"
              >
                Entrar
              </Link>
              <Link href="/register" className="btn-primary">
                Crear cuenta
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
