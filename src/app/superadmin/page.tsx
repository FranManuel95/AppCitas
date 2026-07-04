import Link from "next/link";
import {
  BarChart3,
  CalendarCheck,
  CreditCard,
  Sparkles,
  Store,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { effectivePlan } from "@/lib/domain/plans";
import { getPlatformMetrics } from "@/lib/domain/platform";
import { formatCents } from "@/lib/money";
import { StatTile } from "@/components/ui/stat-tile";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, type BadgeTone } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plataforma" };

const dateFmt = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

// Estados de suscripción → etiqueta y tono de badge.
const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  trialing: "En prueba",
  past_due: "Pago pendiente",
  canceled: "Cancelada",
};

function statusTone(status: string): BadgeTone {
  switch (status) {
    case "active":
      return "success";
    case "trialing":
      return "info";
    case "past_due":
      return "warning";
    default:
      return "neutral";
  }
}

function renewalCell(b: {
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  planRenewsAt: Date | null;
}): string {
  if (b.subscriptionStatus === "trialing" && b.trialEndsAt) {
    return `Prueba hasta ${dateFmt.format(b.trialEndsAt)}`;
  }
  if (b.planRenewsAt) return `Renueva ${dateFmt.format(b.planRenewsAt)}`;
  return "—";
}

const PAGE_SIZE = 50;

export default async function SuperAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.pagina) || 1);

  // Métricas agregadas + tabla paginada: la página no carga todos los negocios
  // de la plataforma (crece con cada alta).
  const [metrics, businesses] = await Promise.all([
    getPlatformMetrics(),
    prisma.business.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        subscriptionStatus: true,
        active: true,
        trialEndsAt: true,
        planRenewsAt: true,
        createdAt: true,
        _count: { select: { appointments: true } },
      },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(metrics.totalBusinesses / PAGE_SIZE));

  // Serie mensual combinada (mismas claves de mes en ambas listas).
  const monthly = metrics.newBusinessesByMonth.map((b, i) => ({
    month: b.month,
    newBusinesses: b.count,
    appointments: metrics.appointmentsByMonth[i]?.count ?? 0,
  }));
  const monthLabel = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("es-ES", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, 1)));
  };
  const maxAppointments = Math.max(1, ...monthly.map((r) => r.appointments));

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Plataforma"
        description="Todos los negocios y el estado de su suscripción SaaS."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={CreditCard}
          tone="success"
          label="MRR estimado"
          value={formatCents(metrics.mrrCents, "EUR")}
          hint={`${metrics.proActive} Pro activos × ${formatCents(2900, "EUR")}`}
        />
        <StatTile
          icon={Store}
          tone="brand"
          label="Negocios"
          value={String(metrics.totalBusinesses)}
          hint={`${metrics.activeBusinesses} activos · ${metrics.suspendedBusinesses} suspendidos`}
        />
        <StatTile
          icon={Sparkles}
          tone="info"
          label="Pro activos / En prueba"
          value={`${metrics.proActive} / ${metrics.trialing}`}
          hint={`${metrics.pastDue} con pago pendiente`}
        />
        <StatTile
          icon={CalendarCheck}
          tone="brand"
          label="Citas este mes"
          value={String(metrics.appointmentsThisMonth)}
          hint={`${metrics.totalAppointments} en total (histórico)`}
        />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <BarChart3 className="h-4 w-4 text-ink-muted" aria-hidden />
          Últimos 6 meses
        </h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="pb-2 font-medium">Mes</th>
              <th className="pb-2 text-right font-medium">Altas</th>
              <th className="pb-2 pl-4 font-medium">Citas</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((row) => (
              <tr key={row.month} className="border-t border-border">
                <td className="py-2 capitalize text-ink-soft">
                  {monthLabel(row.month)}
                </td>
                <td className="py-2 text-right tabular-nums text-ink">
                  {row.newBusinesses}
                </td>
                <td className="py-2 pl-4">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 rounded-full bg-brand-500"
                      style={{
                        width: `${Math.round((row.appointments / maxAppointments) * 100)}%`,
                        minWidth: row.appointments > 0 ? "0.5rem" : "0",
                      }}
                      aria-hidden
                    />
                    <span className="tabular-nums text-ink-soft">
                      {row.appointments}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {businesses.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3 font-medium">Negocio</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Suscripción</th>
                <th className="px-4 py-3 text-right font-medium">Citas</th>
                <th className="px-4 py-3 font-medium">Alta</th>
                <th className="px-4 py-3 font-medium">Prueba / renovación</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-surface-3/50"
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/b/${b.slug}`}
                        className="font-medium text-ink transition-colors hover:text-brand-700 hover:underline"
                      >
                        {b.name}
                      </Link>
                      {!b.active && <Badge tone="danger">Suspendido</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-muted">/{b.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    {/* Plan EFECTIVO: un past_due con plan "pro" almacenado ya
                        no tiene las capacidades Pro, así que no debe mostrarse
                        como Pro. */}
                    <Badge
                      tone={
                        effectivePlan(b).id === "pro" ? "brand" : "neutral"
                      }
                    >
                      {effectivePlan(b).name}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(b.subscriptionStatus)}>
                      {STATUS_LABELS[b.subscriptionStatus] ??
                        b.subscriptionStatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-soft">
                    {b._count.appointments}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                    {dateFmt.format(b.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                    {renewalCell(b)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={Store}
          title="Aún no hay negocios"
          description="Cuando alguien cree su negocio aparecerá aquí con su estado de suscripción."
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-ink-soft">
          <span>
            Página {page} de {totalPages}
          </span>
          <span className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/superadmin?pagina=${page - 1}`}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 shadow-xs transition-colors hover:bg-surface-3"
              >
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/superadmin?pagina=${page + 1}`}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 shadow-xs transition-colors hover:bg-surface-3"
              >
                Siguiente
              </Link>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
