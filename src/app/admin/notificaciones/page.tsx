import {
  BellOff,
  Mail,
  MessageCircle,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notificaciones" };

const CHANNEL_LABELS: Record<string, string> = {
  EMAIL: "Email",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
};

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  EMAIL: Mail,
  SMS: MessageSquare,
  WHATSAPP: MessageCircle,
};

const TEMPLATE_LABELS: Record<string, string> = {
  BOOKING_CONFIRMED: "Confirmación de reserva",
  REMINDER: "Recordatorio",
  CANCELLED: "Cancelación",
};

const STATUS_TONES: Record<string, BadgeTone> = {
  PENDING: "info",
  SENT: "success",
  FAILED: "danger",
  SKIPPED: "neutral",
};

const STATUS_LABELS_N: Record<string, string> = {
  PENDING: "Pendiente",
  SENT: "Enviada",
  FAILED: "Fallida",
  SKIPPED: "Omitida",
};

export default async function NotificationsPage() {
  const admin = await requireBusinessAdmin();
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

  const formatter = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: business.timezone,
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Notificaciones"
        description="Confirmaciones, recordatorios y avisos de cancelación enviados a tus clientes. Los pendientes se despachan automáticamente a su hora."
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="Aún no hay notificaciones."
          description="Se generan al crear o cancelar citas."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3 font-medium">Programada</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Canal</th>
                <th className="px-4 py-3 font-medium">Destinatario</th>
                <th className="px-4 py-3 font-medium">Estado</th>
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
                    {n.appointment?.client.name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">
                    {TEMPLATE_LABELS[n.template] ?? n.template}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone="neutral" icon={CHANNEL_ICONS[n.channel]}>
                      {CHANNEL_LABELS[n.channel] ?? n.channel}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted">{n.recipient}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={STATUS_TONES[n.status] ?? "neutral"}>
                      {STATUS_LABELS_N[n.status] ?? n.status}
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
