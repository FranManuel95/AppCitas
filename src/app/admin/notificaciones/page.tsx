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
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";

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
      select: { timezone: true },
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
    </div>
  );
}
