import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getDashboardStats, getDayAgenda } from "@/lib/domain/stats";
import { formatCents } from "@/lib/money";
import { toLocalTime } from "@/lib/domain/dates";
import { StatusBadge } from "@/components/status-badge";
import {
  RevenueChart,
  StatusChart,
  TopServicesChart,
} from "@/components/admin/dashboard-charts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

function StatTile({
  label,
  value,
  context,
}: {
  label: string;
  value: string;
  context?: string;
}) {
  return (
    <div className="card">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {context && <p className="mt-1 text-xs text-slate-400">{context}</p>}
    </div>
  );
}

export default async function AdminDashboardPage() {
  const admin = await requireBusinessAdmin();
  const [business, stats, agenda] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: admin.businessId },
      select: { currency: true, timezone: true },
    }),
    getDashboardStats(admin.businessId),
    getDayAgenda(admin.businessId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Resumen del mes en curso y evolución anual.
          </p>
        </div>
        <a href="/api/admin/export/revenue" className="btn-secondary" download>
          Ingresos (CSV)
        </a>
      </div>

      {/* KPIs del mes */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Ingresos del mes"
          value={formatCents(stats.monthRevenueCents, business.currency)}
          context="Importes cobrados (citas + cargos por cancelación)"
        />
        <StatTile
          label="Citas del mes"
          value={String(stats.monthAppointments)}
          context={`${stats.upcomingConfirmed} confirmadas próximamente`}
        />
        <StatTile
          label="Cancelaciones tardías"
          value={String(stats.monthLateCancellations)}
          context={`${formatCents(stats.monthLateChargesCents, business.currency)} en cargos este mes`}
        />
        <StatTile
          label="Ocupación del mes"
          value={`${stats.occupancyPercent}%`}
          context={`${stats.uniqueClients} clientes distintos en 12 meses`}
        />
      </div>

      {/* Evolución */}
      <div className="grid gap-6 xl:grid-cols-2">
        <RevenueChart monthly={stats.monthly} currency={business.currency} />
        <StatusChart monthly={stats.monthly} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <TopServicesChart
          services={stats.topServices}
          currency={business.currency}
        />

        {/* Agenda de hoy */}
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Agenda de hoy</h2>
            <Link href="/admin/agenda" className="text-sm text-indigo-600">
              Ver agenda completa
            </Link>
          </div>
          <ul className="mt-4 space-y-2">
            {agenda.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="w-12 text-sm font-semibold tabular-nums text-slate-700">
                    {toLocalTime(a.startAt, business.timezone)}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {a.client.name}
                    </p>
                    <p className="text-xs text-slate-500">{a.service.name}</p>
                  </div>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
            {agenda.length === 0 && (
              <li className="text-sm text-slate-500">Hoy no hay citas.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
