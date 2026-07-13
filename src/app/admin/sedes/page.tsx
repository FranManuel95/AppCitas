import { MapPin } from "lucide-react";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { LocationsManager } from "@/components/admin/locations-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sedes" };

// Multi-sede: cada sede filtra qué parte del equipo atiende. Con una sola
// sede (o sin equipo) el wizard no muestra selector y todo sigue igual.
export default async function SedesPage() {
  const admin = await requireBusinessAdmin();
  const [locations, activeStaff] = await Promise.all([
    prisma.location.findMany({
      where: { businessId: admin.businessId },
      include: {
        _count: { select: { staff: { where: { active: true } } } },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.staffMember.count({
      where: { businessId: admin.businessId, active: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Sedes"
        description={
          activeStaff === 0
            ? "Para trabajar con varias sedes necesitas empleados activos: la sede determina qué parte del equipo atiende. Añade tu equipo primero."
            : "Cada sede filtra el equipo que atiende allí. Asigna la sede de cada empleado en Equipo; los que no tengan sede trabajan en todas."
        }
      />

      {locations.length === 0 && (
        <EmptyState
          icon={MapPin}
          title="Aún no hay sedes"
          description="Si trabajas en un único local no necesitas sedes. Créalas solo cuando tengas más de un local con equipo propio."
        />
      )}

      <LocationsManager
        locations={locations.map((l) => ({
          id: l.id,
          name: l.name,
          address: l.address,
          phone: l.phone,
          active: l.active,
          staffCount: l._count.staff,
        }))}
      />
    </div>
  );
}
