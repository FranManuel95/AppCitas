import { cn } from "@/lib/cn";

const PALETTE = [
  "bg-brand-100 text-brand-300",
  "bg-info-soft text-info-strong",
  "bg-success-soft text-success-strong",
  "bg-warning-soft text-warning-strong",
  "bg-danger-soft text-danger-strong",
];

const SIZES = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
} as const;

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Color determinista a partir del nombre: el mismo nombre → mismo color. */
function paletteFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        SIZES[size],
        paletteFor(name),
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
