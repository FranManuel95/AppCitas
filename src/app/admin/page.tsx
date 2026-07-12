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
import { getDict, fmt } from "@/lib/i18n";
import { getDashboardStats, getDayAgenda } from "@/lib/domain/stats";
import { formatCents } from "@/lib/money";
import { toLocalTime } from "@/lib/domain/dates";
import { StatusBadge } from "@/components/status-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { OnboardingChecklist } from "@/components/admin/onboarding-checklist";
import { loadOnboardingStatus } from "@/lib/domain/onboarding";
import { PlanBanner } from "@/components/admin/plan-banner";
import {
  RevenueChart,
  StatusChart,
  TopServicesChart,
} from "@/components/admin/dashboard-charts-lazy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  const admin = await requireBusinessAdmin();
  const [business, stats, agenda, onboarding, { locale, t }] =
    await Promise.all([
      prisma.business.findUniqueOrThrow({
        where: { id: admin.businessId },
        select: {
          currency: true,
          timezone: true,
          plan: true,
          subscriptionStatus: true,
          trialEndsAt: true,
        },
      }),
      getDashboardStats(admin.businessId),
      getDayAgenda(admin.businessId),
      loadOnboardingStatus(admin.businessId),
      getDict(),
    ]);
  const chartLocale = locale === "es" ? "es-ES" : "en";

  return (
    <div className="space-y-6">
      <PlanBanner
        plan={business.plan}
        subscriptionStatus={business.subscriptionStatus}
        trialEndsAt={business.trialEndsAt}
      />

      <SectionHeader
        as="h1"
        title={t.admin.dashboard.title}
        description={t.admin.dashboard.description}
        action={
          <a
            href="/api/admin/export/revenue"
            className={buttonClasses({ variant: "secondary" })}
            download
          >
            <Download className="h-4 w-4" aria-hidden />
            {t.admin.dashboard.revenueCsv}
          </a>
        }
      />

      {/* Primeros pasos: visible hasta completar los 4 (o hasta ocultarla) */}
      <OnboardingChecklist steps={onboarding.steps} labels={t.admin.onboarding} />

      {/* KPIs del mes */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Wallet}
          tone="brand"
          label={t.admin.dashboard.monthRevenue}
          value={formatCents(stats.monthRevenueCents, business.currency)}
          hint={t.admin.dashboard.monthRevenueHint}
        />
        <StatTile
          icon={CalendarDays}
          tone="info"
          label={t.admin.dashboard.monthAppointments}
          value={String(stats.monthAppointments)}
          hint={fmt(t.admin.dashboard.monthAppointmentsHint, {
            n: stats.upcomingConfirmed,
          })}
        />
        <StatTile
          icon={CalendarX}
          tone="warning"
          label={t.admin.dashboard.lateCancellations}
          value={String(stats.monthLateCancellations)}
          hint={fmt(t.admin.dashboard.lateCancellationsHint, {
            amount: formatCents(stats.monthLateChargesCents, business.currency),
          })}
        />
        <StatTile
          icon={Gauge}
          tone="neutral"
          label={t.admin.dashboard.occupancy}
          value={`${stats.occupancyPercent}%`}
          hint={fmt(t.admin.dashboard.occupancyHint, {
            n: stats.uniqueClients,
          })}
        />
      </div>

      {/* Evolución */}
      <div className="grid gap-6 xl:grid-cols-2">
        <RevenueChart
          monthly={stats.monthly}
          currency={business.currency}
          labels={t.admin.dashboard}
          dateLocale={chartLocale}
        />
        <StatusChart
          monthly={stats.monthly}
          labels={t.admin.dashboard}
          dateLocale={chartLocale}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <TopServicesChart
          services={stats.topServices}
          currency={business.currency}
          labels={t.admin.dashboard}
          dateLocale={chartLocale}
        />

        {/* Agenda de hoy */}
        <Card>
          <SectionHeader
            as="h2"
            title={t.admin.dashboard.todayAgenda}
            action={
              <Link
                href="/admin/agenda"
                className="text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline"
              >
                {t.admin.dashboard.seeFullAgenda}
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
              title={t.admin.dashboard.noAppointmentsToday}
              className="mt-4 py-10"
            />
          )}
        </Card>
      </div>
    </div>
  );
}
