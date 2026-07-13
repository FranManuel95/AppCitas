import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getDict } from "@/lib/i18n";
import { SettingsForm } from "@/components/admin/settings-form";
import { LogoutAllButton } from "@/components/logout-all-button";
import { TwoFactorSetup } from "@/components/two-factor-setup";
import { AUDIT_EVENT_LABELS } from "@/lib/audit";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const admin = await requireBusinessAdmin();
  const { locale, t } = await getDict();
  const [business, activity] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: admin.businessId },
    }),
    prisma.auditLog.findMany({
      where: { userId: admin.id },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title={t.admin.ajustes.title}
        description={t.admin.ajustes.description}
      />
      <SettingsForm
        business={{
          name: business.name,
          description: business.description,
          category: business.category,
          address: business.address,
          phone: business.phone,
          email: business.email,
          cancellationWindowHours: business.cancellationWindowHours,
          lateCancellationFeePercent: business.lateCancellationFeePercent,
          lastMinuteDiscountPercent: business.lastMinuteDiscountPercent,
          slotGranularityMinutes: business.slotGranularityMinutes,
          maxAdvanceBookingDays: business.maxAdvanceBookingDays,
          minNoticeMinutes: business.minNoticeMinutes,
          listedInMarketplace: business.listedInMarketplace,
          requireCardToBook: business.requireCardToBook,
          depositPercent: business.depositPercent,
          remindersEnabled: business.remindersEnabled,
          reminderHoursBefore: business.reminderHoursBefore,
          reminder2HoursBefore: business.reminder2HoursBefore,
          autoCompleteEnabled: business.autoCompleteEnabled,
          notifyByEmail: business.notifyByEmail,
          notifyBySms: business.notifyBySms,
          notifyByWhatsapp: business.notifyByWhatsapp,
          taxId: business.taxId,
          taxPercent: business.taxPercent,
          invoicingEnabled: business.invoicingEnabled,
          brandColor: business.brandColor,
          logoUrl: business.logoUrl,
        }}
        labels={{
          ...t.admin.ajustes,
          saving: t.admin.common.saving,
          saveError: t.admin.common.saveError,
        }}
      />

      {/* Seguridad de la cuenta */}
      <Card>
        <SectionHeader as="h2" title={t.admin.ajustes.securityTitle} />
        <div className="mt-4">
          <TwoFactorSetup />
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <LogoutAllButton />
        </div>
        <h3 className="mt-6 text-sm font-semibold text-ink">
          {t.admin.ajustes.recentActivity}
        </h3>
        <ul className="mt-2 divide-y divide-border text-sm">
          {activity.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5"
            >
              <span className="text-ink-soft">
                {AUDIT_EVENT_LABELS[entry.event] ?? entry.event}
                {entry.detail && (
                  <span className="text-ink-muted"> · {entry.detail}</span>
                )}
              </span>
              <span className="text-xs tabular-nums text-ink-muted">
                {entry.ip ? `${entry.ip} · ` : ""}
                {entry.createdAt.toLocaleString(
                  locale === "es" ? "es-ES" : "en",
                )}
              </span>
            </li>
          ))}
          {activity.length === 0 && (
            <li className="py-2.5 text-ink-muted">
              {t.admin.ajustes.noActivity}
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}
