import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getDict } from "@/lib/i18n";
import { ServicesManager } from "@/components/admin/services-manager";
import { SectionHeader } from "@/components/ui/section-header";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: t.admin.servicios.title };
}

export default async function ServicesPage() {
  const admin = await requireBusinessAdmin();
  const { t } = await getDict();
  const [business, services] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: admin.businessId },
      select: { currency: true },
    }),
    prisma.service.findMany({
      where: { businessId: admin.businessId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title={t.admin.servicios.title}
        description={t.admin.servicios.description}
      />
      <ServicesManager
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          durationMinutes: s.durationMinutes,
          priceCents: s.priceCents,
          color: s.color,
          active: s.active,
        }))}
        currency={business.currency}
        labels={{ servicios: t.admin.servicios, common: t.admin.common }}
      />
    </div>
  );
}
