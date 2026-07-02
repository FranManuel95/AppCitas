import { cn } from "@/lib/cn";

/** Bloque de carga con pulso; dimensiona con clases (h-*, w-*). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-3", className)}
      aria-hidden
    />
  );
}
