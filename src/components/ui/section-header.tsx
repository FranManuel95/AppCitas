import { cn } from "@/lib/cn";

/** Cabecera de sección: título + descripción a la izquierda, acción a la derecha. */
export function SectionHeader({
  title,
  description,
  action,
  as: Heading = "h2",
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-wrap items-end justify-between gap-3", className)}
    >
      <div className="min-w-0">
        <Heading
          className={cn(
            "font-semibold tracking-tight text-ink",
            Heading === "h1" ? "text-2xl" : "text-lg",
          )}
        >
          {title}
        </Heading>
        {description ? (
          <p className="mt-1 text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
