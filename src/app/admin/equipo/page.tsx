import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { StaffManager } from "@/components/admin/staff-manager";
import { SectionHeader } from "@/components/ui/section-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Equipo" };

export default async function StaffPage() {
  const admin = await requireBusinessAdmin();
  const [staff, services] = await Promise.all([
    prisma.staffMember.findMany({
      where: { businessId: admin.businessId },
      include: {
        hours: { orderBy: [{ weekday: "asc" }, { openTime: "asc" }] },
        services: { select: { serviceId: true } },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.service.findMany({
      where: { businessId: admin.businessId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Equipo"
        description="Cada empleado tiene su propia agenda: varias citas pueden coincidir en hora si las atienden personas distintas."
      />
      <StaffManager
        staff={staff.map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          phone: m.phone,
          color: m.color,
          active: m.active,
          hasAccess: !!m.userId,
          hours: m.hours.map((h) => ({
            weekday: h.weekday,
            openTime: h.openTime,
            closeTime: h.closeTime,
          })),
          serviceIds: m.services.map((s) => s.serviceId),
        }))}
        services={services}
      />
    </div>
  );
}
