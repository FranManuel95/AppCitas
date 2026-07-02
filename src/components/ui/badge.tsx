import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/design/tokens";

export type BadgeTone = Tone | "brand";

/* Pares fondo suave / texto fuerte verificados a ≥4.5:1 (ver tokens.ts). */
const TONES: Record<BadgeTone, string> = {
  success: "bg-success-soft text-success-strong",
  warning: "bg-warning-soft text-warning-strong",
  danger: "bg-danger-soft text-danger-strong",
  info: "bg-info-soft text-info-strong",
  neutral: "bg-surface-3 text-ink-soft",
  brand: "bg-brand-100 text-brand-700",
};

export function Badge({
  tone = "neutral",
  icon: Icon,
  className,
  children,
}: {
  tone?: BadgeTone;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {Icon ? <Icon className="h-3 w-3 shrink-0" aria-hidden /> : null}
      {children}
    </span>
  );
}
