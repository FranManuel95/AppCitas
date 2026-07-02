import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white shadow-xs hover:bg-brand-700 active:bg-brand-800",
  secondary:
    "border border-border-strong bg-surface text-ink-soft shadow-xs hover:bg-surface-2 hover:text-ink",
  ghost: "text-ink-soft hover:bg-surface-3 hover:text-ink",
  danger:
    "bg-danger text-white shadow-xs hover:bg-danger-strong focus-visible:outline-danger",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "gap-1.5 rounded-md px-3 py-1.5 text-xs",
  md: "gap-2 rounded-lg px-4 py-2 text-sm",
  lg: "gap-2 rounded-lg px-5 py-2.5 text-sm",
};

/** Clases de botón para usar sobre <Link> u otros elementos no-botón. */
export function buttonClasses(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const { variant = "primary", size = "md", className } = opts ?? {};
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    />
  );
}
