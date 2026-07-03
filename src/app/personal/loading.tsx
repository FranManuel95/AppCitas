import { Skeleton } from "@/components/ui/skeleton";

// Skeleton del portal del empleado: título + agenda del día, con el mismo
// contenedor max-w-3xl de la página.
export default function PersonalLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Skeleton className="h-8 w-48" />
      <div className="mt-8 space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    </main>
  );
}
