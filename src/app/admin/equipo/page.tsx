import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getDict } from "@/lib/i18n";
import { StaffManager } from "@/components/admin/staff-manager";
import { SectionHeader } from "@/components/ui/section-header";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: t.admin.equipo.title };
}

export default async function StaffPage() {
  const admin = await requireBusinessAdmin();
  const { locale, t } = await getDict();
  const [staff, services, locations] = await Promise.all([
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
    prisma.location.findMany({
      where: { businessId: admin.businessId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title={t.admin.equipo.title}
        description={t.admin.equipo.description}
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
          locationId: m.locationId,
        }))}
        services={services}
        locations={locations}
        locale={locale}
        labels={{ equipo: t.admin.equipo, common: t.admin.common }}
      />
    </div>
  );
}
