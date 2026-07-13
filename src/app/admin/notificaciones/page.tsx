import {
  BellOff,
  Mail,
  MessageCircle,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getDict } from "@/lib/i18n";
import {
  bookingConfirmedMessage,
  cancellationMessage,
  noShowMessage,
  parseTemplateOverrides,
  renderTemplate,
  reminderMessage,
  type AppointmentMessageContext,
} from "@/lib/notifications/templates";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { NotificationTemplatesEditor } from "@/components/admin/notification-templates-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notificaciones" };

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  EMAIL: Mail,
  SMS: MessageSquare,
  WHATSAPP: MessageCircle,
};

const STATUS_TONES: Record<string, BadgeTone> = {
  PENDING: "info",
  SENT: "success",
  FAILED: "danger",
  SKIPPED: "neutral",
};

export default async function NotificationsPage() {
  const admin = await requireBusinessAdmin();
  const { locale, t } = await getDict();
  const nt = t.admin.notificaciones;

  const channelLabels: Record<string, string> = {
    EMAIL: nt.channelEmail,
    SMS: nt.channelSms,
    WHATSAPP: nt.channelWhatsapp,
  };

  const templateLabels: Record<string, string> = {
    BOOKING_CONFIRMED: nt.templateBookingConfirmed,
    REMINDER: nt.templateReminder,
    CANCELLED: nt.templateCancelled,
    NO_SHOW: nt.templateNoShow,
    CAMPAIGN: nt.templateCampaign,
    LOYALTY_REWARD: nt.templateLoyaltyReward,
    WAITLIST_SLOT_FREED: nt.templateWaitlistSlotFreed,
  };

  const statusLabels: Record<string, string> = {
    PENDING: nt.statusPending,
    SENT: nt.statusSent,
    FAILED: nt.statusFailed,
    SKIPPED: nt.statusSkipped,
  };
  const [business, notifications] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: admin.businessId },
      select: {
        name: true,
        timezone: true,
        currency: true,
        cancellationWindowHours: true,
        lateCancellationFeePercent: true,
        notificationTemplates: true,
        services: {
          where: { active: true },
          orderBy: { name: "asc" },
          take: 1,
          select: { name: true, priceCents: true },
        },
      },
    }),
    prisma.notification.findMany({
      where: { businessId: admin.businessId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        appointment: {
          select: { client: { select: { name: true } } },
        },
      },
    }),
  ]);

  const formatter = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: business.timezone,
  });

  // Datos de ejemplo para la vista previa del editor de textos: el mensaje
  // por defecto ya renderizado y el valor de cada variable {…}.
  const sampleCtx: AppointmentMessageContext = {
    clientName: "Marta",
    businessName: business.name,
    serviceName: business.services[0]?.name ?? "Corte de pelo",
    staffName: null,
    startAt: new Date(Date.now() + 24 * 3_600_000),
    timezone: business.timezone,
    currency: business.currency,
    priceCents: business.services[0]?.priceCents ?? 2500,
    cancellationWindowHours: business.cancellationWindowHours,
    lateCancellationFeePercent: business.lateCancellationFeePercent,
    confirmationUrl: "https://…/c/ejemplo",
  };
  const templateDefaults = {
    BOOKING_CONFIRMED: bookingConfirmedMessage(sampleCtx),
    REMINDER: reminderMessage(sampleCtx),
    CANCELLED: cancellationMessage(sampleCtx, 0),
    NO_SHOW: noShowMessage(sampleCtx, 0),
  };
  const sampleValues = Object.fromEntries(
    (["cliente", "negocio", "servicio", "fecha", "hora", "precio", "enlace"] as const).map(
      (v) => [v, renderTemplate(`{${v}}`, sampleCtx)],
    ),
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title={nt.title}
        description={nt.description}
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={nt.emptyTitle}
          description={nt.emptyDescription}
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3 font-medium">{nt.colScheduled}</th>
                <th className="px-4 py-3 font-medium">{nt.colClient}</th>
                <th className="px-4 py-3 font-medium">{nt.colType}</th>
                <th className="px-4 py-3 font-medium">{nt.colChannel}</th>
                <th className="px-4 py-3 font-medium">{nt.colRecipient}</th>
                <th className="px-4 py-3 font-medium">{nt.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((n) => (
                <tr
                  key={n.id}
                  className="border-b border-border align-top transition-colors last:border-0 hover:bg-surface-3/60"
                >
                  <td className="px-4 py-2.5 tabular-nums text-ink-soft">
                    {formatter.format(n.scheduledFor)}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-ink">
                    {n.appointment?.client.name ?? t.admin.common.emptyValue}
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">
                    {templateLabels[n.template] ?? n.template}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone="neutral" icon={CHANNEL_ICONS[n.channel]}>
                      {channelLabels[n.channel] ?? n.channel}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted">{n.recipient}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={STATUS_TONES[n.status] ?? "neutral"}>
                      {statusLabels[n.status] ?? n.status}
                    </Badge>
                    {n.lastError && (
                      <p className="mt-1 max-w-48 text-xs text-ink-muted">
                        {n.lastError}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <NotificationTemplatesEditor
        initial={parseTemplateOverrides(business.notificationTemplates)}
        defaults={templateDefaults}
        sampleValues={sampleValues}
      />
    </div>
  );
}
