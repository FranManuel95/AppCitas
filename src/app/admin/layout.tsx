import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { LogoutButton } from "@/components/logout-button";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/agenda", label: "Agenda" },
  { href: "/admin/citas", label: "Citas" },
  { href: "/admin/equipo", label: "Equipo" },
  { href: "/admin/servicios", label: "Servicios" },
  { href: "/admin/horario", label: "Horario" },
  { href: "/admin/notificaciones", label: "Notificaciones" },
  { href: "/admin/ajustes", label: "Ajustes" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireBusinessAdmin();
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: admin.businessId },
    select: { name: true, slug: true },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-lg font-semibold text-indigo-600">
              AppCitas
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-medium text-slate-700">
              {business.name}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href={`/b/${business.slug}`}
              className="text-slate-500 hover:text-slate-800"
            >
              Ver página pública
            </Link>
            <span className="hidden text-slate-400 sm:inline">
              {admin.name}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-4 py-8">
        <nav className="w-44 shrink-0">
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-900"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
