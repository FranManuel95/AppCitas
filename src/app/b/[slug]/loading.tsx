import { Skeleton } from "@/components/ui/skeleton";

// Skeleton de la página pública de negocio: cabecera del negocio (avatar +
// título) y lista de tarjetas de servicios, con el mismo contenedor max-w-5xl.
// No duplica el header del sitio.
export default function BusinessLoading() {
  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10">
        <div className="flex items-start gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-4 w-44 max-w-full" />
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 pb-16">
        <Skeleton className="h-6 w-32" />
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    </main>
  );
}
