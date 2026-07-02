import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { PromosManager } from "@/components/admin/promos-manager";
import { SectionHeader } from "@/components/ui/section-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Promociones" };

export default async function PromosPage() {
  const admin = await requireBusinessAdmin();
  const [business, packages, coupons, services] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: admin.businessId },
      select: { currency: true },
    }),
    prisma.package.findMany({
      where: { businessId: admin.businessId },
      include: {
        service: { select: { name: true, priceCents: true } },
        _count: { select: { purchases: true } },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.coupon.findMany({
      where: { businessId: admin.businessId },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    }),
    prisma.service.findMany({
      where: { businessId: admin.businessId, active: true },
      select: { id: true, name: true, priceCents: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Promociones"
        description="Bonos prepagados y cupones de descuento para tus clientes."
      />
      <PromosManager
        packages={packages.map((p) => ({
          id: p.id,
          name: p.name,
          serviceId: p.serviceId,
          serviceName: p.service.name,
          servicePriceCents: p.service.priceCents,
          sessions: p.sessions,
          priceCents: p.priceCents,
          validityDays: p.validityDays,
          active: p.active,
          purchases: p._count.purchases,
        }))}
        coupons={coupons.map((c) => ({
          id: c.id,
          code: c.code,
          type: c.type,
          value: c.value,
          active: c.active,
          maxRedemptions: c.maxRedemptions,
          timesRedeemed: c.timesRedeemed,
          expiresAt: c.expiresAt?.toISOString() ?? null,
        }))}
        services={services}
        currency={business.currency}
      />
    </div>
  );
}
