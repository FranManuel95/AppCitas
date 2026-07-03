import { Skeleton } from "@/components/ui/skeleton";

// Skeleton del panel de plataforma. Se renderiza dentro del layout de
// /superadmin (conserva la cabecera): solo repite el contenido.
export default function SuperAdminLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
