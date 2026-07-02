import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Stepper horizontal: pasos completados (check), actual (resaltado) y
 * pendientes. `current` es el índice 0-based del paso activo.
 */
export function Stepper({
  steps,
  current,
  className,
}: {
  steps: string[];
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn("flex items-center", className)}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={label}
            className={cn("flex items-center", i > 0 && "flex-1")}
            aria-current={active ? "step" : undefined}
          >
            {i > 0 && (
              <span
                className={cn(
                  "mx-2 h-0.5 flex-1 rounded-full sm:mx-3",
                  done || active ? "bg-brand-500" : "bg-border-strong",
                )}
                aria-hidden
              />
            )}
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  done && "bg-brand-600 text-white",
                  active &&
                    "bg-brand-600 text-white ring-4 ring-brand-100",
                  !done && !active && "bg-surface-3 text-ink-muted",
                )}
              >
                {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-sm font-medium",
                  active ? "text-ink" : "text-ink-muted",
                  // En pantallas pequeñas solo se muestra la etiqueta activa
                  !active && "hidden sm:inline",
                )}
              >
                {label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
