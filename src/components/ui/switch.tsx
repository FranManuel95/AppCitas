import { cn } from "@/lib/cn";

/**
 * Interruptor accesible sin JavaScript: un checkbox real (se envía en
 * formularios vía `name`/`defaultChecked`) con la pista y el pulgar en CSS.
 * Acepta los mismos props que un <input type="checkbox">.
 */
export function Switch({
  className,
  label,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-2.5",
        props.disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" {...props} />
        <span
          className="h-5 w-9 rounded-full bg-border-strong transition-colors peer-checked:bg-brand-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600"
          aria-hidden
        />
        <span
          className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-xs transition-transform peer-checked:translate-x-4"
          aria-hidden
        />
      </span>
      {label ? <span className="text-sm text-ink-soft">{label}</span> : null}
    </label>
  );
}
