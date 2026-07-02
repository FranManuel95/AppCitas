import { Skeleton } from "@/components/ui/skeleton";

// Skeleton del shell público: barra superior (h-16, como SiteHeader) y
// bloques grandes de contenido con el mismo contenedor max-w-5xl.
export default function Loading() {
  return (
    <>
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-16 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
        </div>
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-12">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-7 w-56" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      </main>
    </>
  );
}
