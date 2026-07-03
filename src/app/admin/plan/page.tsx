import { Suspense } from "react";
import { Check, CreditCard } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import {
  PLANS,
  planFor,
  effectivePlan,
  getPlanUsage,
  type PlanDefinition,
} from "@/lib/domain/plans";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { PlanActions } from "@/components/admin/plan-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plan" };

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  trialing: { label: "En prueba", tone: "info" },
  active: { label: "Activa", tone: "success" },
  past_due: { label: "Pago pendiente", tone: "warning" },
  canceled: { label: "Cancelada", tone: "neutral" },
};

const dateFmt = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Barra de progreso de uso; con límite null muestra "ilimitado". */
function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  let pct = 100;
  let fill = "bg-brand-200"; // ilimitado: barra tenue, siempre hay hueco
  if (limit !== null) {
    pct = limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
    fill =
      used >= limit
        ? "bg-danger"
        : used / limit >= 0.8
          ? "bg-warning"
          : "bg-brand-600";
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-ink-soft">{label}</span>
        <span className="font-medium tabular-nums text-ink">
          {used}{" "}
          <span className="text-ink-muted">
            / {limit === null ? "ilimitado" : limit}
          </span>
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn("h-full rounded-full", fill)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function planFeatures(p: PlanDefinition): string[] {
  return [
    p.limits.staff === null
      ? "Empleados ilimitados"
      : `Hasta ${p.limits.staff} empleado${p.limits.staff === 1 ? "" : "s"}`,
    p.limits.monthlyAppointments === null
      ? "Citas ilimitadas al mes"
      : `Hasta ${p.limits.monthlyAppointments} citas al mes`,
  ];
}

export default async function AdminPlanPage() {
  const admin = await requireBusinessAdmin();
  const [business, usage] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: admin.businessId },
      select: {
        plan: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        planRenewsAt: true,
      },
    }),
    getPlanUsage(admin.businessId),
  ]);

  const currentPlan = planFor(business.plan);
  const limits = effectivePlan(business).limits;
  const status = STATUS[business.subscriptionStatus] ?? {
    label: business.subscriptionStatus,
    tone: "neutral" as BadgeTone,
  };

  let dateLine: string | null = null;
  if (business.subscriptionStatus === "trialing" && business.trialEndsAt) {
    dateLine = `Tu prueba termina el ${dateFmt.format(business.trialEndsAt)}`;
  } else if (
    business.planRenewsAt &&
    (business.subscriptionStatus === "active" ||
      business.subscriptionStatus === "past_due")
  ) {
    dateLine = `Se renueva el ${dateFmt.format(business.planRenewsAt)}`;
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Plan y facturación"
        description="Gestiona tu suscripción y consulta el uso frente a los límites de tu plan."
      />

      <Card className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <CreditCard className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-ink">
                Plan {currentPlan.name}
              </h2>
              {dateLine ? (
                <p className="mt-0.5 text-sm text-ink-muted">{dateLine}</p>
              ) : null}
            </div>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>

        <div className="space-y-4 border-t border-border pt-5">
          <p className="text-sm font-medium text-ink-soft">Uso actual</p>
          <UsageBar label="Empleados" used={usage.staff} limit={limits.staff} />
          <UsageBar
            label="Citas este mes"
            used={usage.monthlyAppointments}
            limit={limits.monthlyAppointments}
          />
        </div>

        <div className="border-t border-border pt-5">
          <Suspense>
            <PlanActions
              plan={business.plan}
              subscriptionStatus={business.subscriptionStatus}
            />
          </Suspense>
        </div>
      </Card>

      <div className="space-y-3">
        <SectionHeader as="h2" title="Compara los planes" />
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.values(PLANS) as PlanDefinition[]).map((p) => {
            const isCurrent = p.id === currentPlan.id;
            return (
              <Card
                key={p.id}
                className={cn(
                  "space-y-4",
                  isCurrent && "ring-2 ring-brand-500",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-ink">{p.name}</h3>
                  {isCurrent ? (
                    <Badge tone="brand">Plan actual</Badge>
                  ) : null}
                </div>
                <p className="text-2xl font-semibold tracking-tight text-ink">
                  {p.priceCentsPerMonth === 0 ? (
                    "Gratis"
                  ) : (
                    <>
                      {formatCents(p.priceCentsPerMonth)}
                      <span className="text-sm font-normal text-ink-muted">
                        {" "}
                        / mes
                      </span>
                    </>
                  )}
                </p>
                <ul className="space-y-2">
                  {planFeatures(p).map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-ink-soft"
                    >
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-success-strong"
                        aria-hidden
                      />
                      {f}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
