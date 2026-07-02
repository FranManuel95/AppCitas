import { Skeleton } from "@/components/ui/skeleton";

// Skeleton de "Mis citas": título + lista de tarjetas, con el mismo
// contenedor max-w-3xl de la página. No duplica el header del sitio.
export default function MyAppointmentsLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Skeleton className="h-8 w-40" />
      <div className="mt-8 space-y-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
      <div className="mt-10 space-y-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    </main>
  );
}
