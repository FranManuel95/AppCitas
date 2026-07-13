"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Circle, CircleCheck, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { fmt } from "@/lib/i18n/shared";
import type { OnboardingStep } from "@/lib/domain/onboarding";

export type OnboardingChecklistLabels = {
  title: string;
  description: string;
  stepService: string;
  stepHours: string;
  stepPayments: string;
  stepStaff: string;
  stepSecurity: string;
  progress: string;
  hide: string;
  optionalBadge: string;
};

// El dueño puede ocultarla; se recuerda en su navegador sin columna nueva.
const DISMISS_KEY = "appcitas.onboarding.dismissed";

// Checklist de primeros pasos: visible hasta completar los 4 (o hasta que el
// dueño la oculte). Cada paso enlaza a su página y muestra progreso real.
export function OnboardingChecklist({
  steps,
  labels,
}: {
  steps: OnboardingStep[];
  labels: OnboardingChecklistLabels;
}) {
  // Empieza oculta y aparece tras leer localStorage: evita el parpadeo de
  // mostrarla a quien ya la descartó (el dashboard tiene contenido de sobra).
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(localStorage.getItem(DISMISS_KEY) !== "1");
  }, []);

  const completed = steps.filter((s) => s.done).length;
  if (!visible || completed === steps.length) return null;

  const STEP_LABELS: Record<OnboardingStep["key"], string> = {
    services: labels.stepService,
    hours: labels.stepHours,
    payments: labels.stepPayments,
    staff: labels.stepStaff,
    security: labels.stepSecurity,
  };

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{labels.title}</h2>
          <p className="mt-1 text-sm text-ink-muted">{labels.description}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={labels.hide}
          title={labels.hide}
          className="shrink-0 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Progreso real: los pasos completados empujan la barra */}
      <div className="mt-4 flex items-center gap-3">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={completed}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"
        >
          <div
            className="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${(completed / steps.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium tabular-nums text-ink-soft">
          {fmt(labels.progress, { done: completed, total: steps.length })}
        </span>
      </div>

      <ul className="mt-3 space-y-1">
        {steps.map((step) => (
          <li key={step.key}>
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
                {STEP_LABELS[step.key]}
              </span>
              {step.optional && !step.done && (
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-ink-muted">
                  {labels.optionalBadge}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
