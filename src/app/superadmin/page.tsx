import Link from "next/link";
import { Clock, Sparkles, Store } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { effectivePlan } from "@/lib/domain/plans";
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

  // Tarjetas con counts agregados y tabla paginada: la página no carga todos
  // los negocios de la plataforma (crece con cada alta).
  const [total, proActive, trialing, businesses] = await Promise.all([
    prisma.business.count(),
    prisma.business.count({
      where: { plan: "pro", subscriptionStatus: "active" },
    }),
    prisma.business.count({ where: { subscriptionStatus: "trialing" } }),
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
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Plataforma"
        description="Todos los negocios y el estado de su suscripción SaaS."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          icon={Store}
          tone="brand"
          label="Negocios"
          value={String(total)}
          hint="Total en la plataforma"
        />
        <StatTile
          icon={Sparkles}
          tone="success"
          label="Pro activos"
          value={String(proActive)}
          hint="Con suscripción de pago activa"
        />
        <StatTile
          icon={Clock}
          tone="info"
          label="En prueba"
          value={String(trialing)}
          hint="Periodo de prueba en curso"
        />
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
