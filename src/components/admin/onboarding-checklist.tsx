import Link from "next/link";
import { Circle, CircleCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

// Textos de la checklist. El diccionario i18n (src/lib/i18n/shared.ts) aún no
// tiene claves de onboarding, así que por ahora se usan estos valores en
// español; cuando existan, la página puede pasarlos vía `labels`.
export type OnboardingChecklistLabels = {
  title: string;
  description: string;
  stepService: string;
  stepHours: string;
  stepPayments: string;
  stepStaff: string;
};

const DEFAULT_LABELS: OnboardingChecklistLabels = {
  title: "Primeros pasos",
  description:
    "Completa estos pasos para que tus clientes puedan empezar a reservar.",
  stepService: "Crea tu primer servicio",
  stepHours: "Revisa el horario de apertura",
  stepPayments: "Configura los pagos",
  stepStaff: "Invita a tu equipo",
};

export function OnboardingChecklist({
  hasServices,
  hasHours,
  paymentsConfigured,
  hasStaff,
  labels = DEFAULT_LABELS,
}: {
  hasServices: boolean;
  hasHours: boolean;
  paymentsConfigured: boolean;
  hasStaff: boolean;
  labels?: OnboardingChecklistLabels;
}) {
  const steps: Array<{ href: string; label: string; done: boolean }> = [
    { href: "/admin/servicios", label: labels.stepService, done: hasServices },
    { href: "/admin/horario", label: labels.stepHours, done: hasHours },
    {
      href: "/admin/ajustes",
      label: labels.stepPayments,
      done: paymentsConfigured,
    },
    { href: "/admin/equipo", label: labels.stepStaff, done: hasStaff },
  ];

  return (
    <Card>
      <h2 className="text-base font-semibold text-ink">{labels.title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{labels.description}</p>
      <ul className="mt-4 space-y-1">
        {steps.map((step) => (
          <li key={step.href}>
            <Link
              href={step.href}
              className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-surface-3/60"
            >
              {step.done ? (
                <CircleCheck
                  className="h-5 w-5 shrink-0 text-success"
                  aria-hidden
                />
              ) : (
                <Circle
                  className="h-5 w-5 shrink-0 text-ink-muted"
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  "text-sm transition-colors",
                  step.done
                    ? "text-ink-muted line-through"
                    : "font-medium text-ink-soft group-hover:text-ink",
                )}
              >
                {step.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
