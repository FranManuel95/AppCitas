import { cn } from "@/lib/cn";

/** Etiqueta + control + ayuda/error con estilos coherentes. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="mt-1 text-xs text-ink-muted">{hint}</p>
      ) : null}
      {error ? (
        <p className="mt-1 text-xs font-medium text-danger-strong">{error}</p>
      ) : null}
    </div>
  );
}

// Con ComponentPropsWithRef, `ref` es una prop válida y se reenvía al elemento
// nativo (React 19: los componentes de función aceptan ref como prop normal).
export function Input({
  className,
  ...props
}: React.ComponentPropsWithRef<"input">) {
  return <input className={cn("input", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.ComponentPropsWithRef<"textarea">) {
  return <textarea className={cn("input", className)} {...props} />;
}

export function Select({
  className,
  ...props
}: React.ComponentPropsWithRef<"select">) {
  return <select className={cn("input", className)} {...props} />;
}
