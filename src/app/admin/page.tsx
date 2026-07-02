import Link from "next/link";
import {
  CalendarDays,
  CalendarX,
  Download,
  Gauge,
  Wallet,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getDashboardStats, getDayAgenda } from "@/lib/domain/stats";
import { formatCents } from "@/lib/money";
import { toLocalTime } from "@/lib/domain/dates";
import { StatusBadge } from "@/components/status-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import {
  RevenueChart,
  StatusChart,
  TopServicesChart,
} from "@/components/admin/dashboard-charts-lazy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

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
      <SectionHeader
        as="h1"
        title="Dashboard"
        description="Resumen del mes en curso y evolución anual."
        action={
          <a
            href="/api/admin/export/revenue"
            className={buttonClasses({ variant: "secondary" })}
            download
          >
            <Download className="h-4 w-4" aria-hidden />
            Ingresos (CSV)
          </a>
        }
      />

      {/* KPIs del mes */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Wallet}
          tone="brand"
          label="Ingresos del mes"
          value={formatCents(stats.monthRevenueCents, business.currency)}
          hint="Importes cobrados (citas + cargos por cancelación)"
        />
        <StatTile
          icon={CalendarDays}
          tone="info"
          label="Citas del mes"
          value={String(stats.monthAppointments)}
          hint={`${stats.upcomingConfirmed} confirmadas próximamente`}
        />
        <StatTile
          icon={CalendarX}
          tone="warning"
          label="Cancelaciones tardías"
          value={String(stats.monthLateCancellations)}
          hint={`${formatCents(stats.monthLateChargesCents, business.currency)} en cargos este mes`}
        />
        <StatTile
          icon={Gauge}
          tone="neutral"
          label="Ocupación del mes"
          value={`${stats.occupancyPercent}%`}
          hint={`${stats.uniqueClients} clientes distintos en 12 meses`}
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
        <Card>
          <SectionHeader
            as="h2"
            title="Agenda de hoy"
            action={
              <Link
                href="/admin/agenda"
                className="text-sm font-medium text-brand-300 hover:text-brand-200 hover:underline"
              >
                Ver agenda completa
              </Link>
            }
          />
          {agenda.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {agenda.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-surface-3/60"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-12 shrink-0 text-sm font-medium tabular-nums text-ink">
                      {toLocalTime(a.startAt, business.timezone)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-soft">
                        {a.client.name}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {a.service.name}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="Hoy no hay citas."
              className="mt-4 py-10"
            />
          )}
        </Card>
      </div>
    </div>
  );
}
