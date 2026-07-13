import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getDict } from "@/lib/i18n";
import { PromosManager } from "@/components/admin/promos-manager";
import { LoyaltyProgramCard } from "@/components/admin/loyalty-program-card";
import { MembershipPlansCard } from "@/components/admin/membership-plans-card";
import { SectionHeader } from "@/components/ui/section-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Promociones" };

export default async function PromosPage() {
  const admin = await requireBusinessAdmin();
  const { locale, t } = await getDict();
  const [business, packages, coupons, services, loyaltyProgram, membershipPlans] =
    await Promise.all([
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
    prisma.loyaltyProgram.findUnique({
      where: { businessId: admin.businessId },
    }),
    prisma.membershipPlan.findMany({
      where: { businessId: admin.businessId },
      include: {
        _count: {
          select: {
            memberships: { where: { status: { in: ["active", "past_due"] } } },
          },
        },
      },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title={t.admin.promos.title}
        description={t.admin.promos.description}
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
          personal: c.clientId !== null,
        }))}
        services={services}
        currency={business.currency}
        dateLocale={locale === "es" ? "es-ES" : "en"}
        labels={{
          ...t.admin.promos,
          cancel: t.admin.common.cancel,
          activate: t.admin.common.activate,
          deactivate: t.admin.common.deactivate,
          active: t.admin.common.active,
          inactive: t.admin.common.inactive,
        }}
      />

      <LoyaltyProgramCard
        initial={
          loyaltyProgram
            ? {
                active: loyaltyProgram.active,
                stampsRequired: loyaltyProgram.stampsRequired,
                rewardPercent: loyaltyProgram.rewardPercent,
                rewardValidityDays: loyaltyProgram.rewardValidityDays,
              }
            : null
        }
      />

      <MembershipPlansCard
        plans={membershipPlans.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          priceCents: p.priceCents,
          discountPercent: p.discountPercent,
          maxAppointmentsPerMonth: p.maxAppointmentsPerMonth,
          active: p.active,
          members: p._count.memberships,
        }))}
        currency={business.currency}
      />
    </div>
  );
}
