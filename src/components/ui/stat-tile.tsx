import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { BadgeTone } from "@/components/ui/badge";

const ICON_TONES: Record<BadgeTone, string> = {
  success: "bg-success-soft text-success-strong",
  warning: "bg-warning-soft text-warning-strong",
  danger: "bg-danger-soft text-danger-strong",
  info: "bg-info-soft text-info-strong",
  neutral: "bg-surface-3 text-ink-soft",
  brand: "bg-brand-100 text-brand-700",
};

/** KPI: icono en chip de color + valor grande + etiqueta y nota opcional. */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "brand",
  className,
}: {
  icon: LucideIcon;
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface p-5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-ink-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
        </div>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            ICON_TONES[tone],
          )}
        >
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </span>
      </div>
    </div>
  );
}
