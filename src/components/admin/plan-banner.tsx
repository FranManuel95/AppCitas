import Link from "next/link";
import { CreditCard, TriangleAlert } from "lucide-react";

const DAY_MS = 24 * 60 * 60 * 1000;

const trialDateFmt = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
});

/**
 * Aviso de facturación en la cabecera del panel. Solo aparece cuando hay algo
 * que atender: un pago pendiente (past_due) o una prueba a punto de terminar
 * (trialing con menos de 4 días). En cualquier otro caso no renderiza nada.
 *
 * Recibe los campos crudos del negocio (incluido `plan`, parte del contrato
 * aunque la decisión dependa hoy solo del estado de la suscripción).
 */
export function PlanBanner({
  subscriptionStatus,
  trialEndsAt,
  now = new Date(),
}: {
  plan: string;
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  now?: Date;
}) {
  if (subscriptionStatus === "past_due") {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-strong">
        <span className="flex min-w-0 items-start gap-2.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Tu suscripción tiene un pago pendiente. Actualiza tu método de pago
            para no perder las funciones de tu plan.
          </p>
        </span>
        <Link
          href="/admin/plan"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-danger/40 bg-surface px-3 py-1.5 text-xs font-medium text-danger-strong shadow-xs transition-colors hover:border-danger/70"
        >
          <CreditCard className="h-3.5 w-3.5" aria-hidden />
          Resolver pago
        </Link>
      </div>
    );
  }

  if (subscriptionStatus === "trialing" && trialEndsAt) {
    const daysLeft = Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS);
    if (daysLeft < 4) {
      return (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-strong">
          <span className="flex min-w-0 items-start gap-2.5">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              Tu prueba termina el {trialDateFmt.format(trialEndsAt)}. Mejora a
              Pro para seguir sin límites.
            </p>
          </span>
          <Link
            href="/admin/plan"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-warning/40 bg-surface px-3 py-1.5 text-xs font-medium text-warning-strong shadow-xs transition-colors hover:border-warning/70"
          >
            <CreditCard className="h-3.5 w-3.5" aria-hidden />
            Ver planes
          </Link>
        </div>
      );
    }
  }

  return null;
}
