import Link from "next/link";
import { Clock, Sparkles, Store } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { planFor } from "@/lib/domain/plans";
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

export default async function SuperAdminPage() {
  await requireSuperAdmin();

  const businesses = await prisma.business.findMany({
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
  });

  const total = businesses.length;
  const proActive = businesses.filter(
    (b) => b.plan === "pro" && b.subscriptionStatus === "active",
  ).length;
  const trialing = businesses.filter(
    (b) => b.subscriptionStatus === "trialing",
  ).length;

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
                    <Badge tone={b.plan === "pro" ? "brand" : "neutral"}>
                      {planFor(b.plan).name}
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
    </div>
  );
}
