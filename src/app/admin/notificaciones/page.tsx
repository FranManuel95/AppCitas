import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notificaciones" };

const CHANNEL_LABELS: Record<string, string> = {
  EMAIL: "Email",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
};

const TEMPLATE_LABELS: Record<string, string> = {
  BOOKING_CONFIRMED: "Confirmación de reserva",
  REMINDER: "Recordatorio",
  CANCELLED: "Cancelación",
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-sky-100 text-sky-700",
  SENT: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-rose-100 text-rose-700",
  SKIPPED: "bg-slate-100 text-slate-600",
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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Notificaciones</h1>
        <p className="text-sm text-slate-500">
          Confirmaciones, recordatorios y avisos de cancelación enviados a tus
          clientes. Los pendientes se despachan automáticamente a su hora.
        </p>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
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
              <tr key={n.id} className="border-b border-slate-100 align-top">
                <td className="px-4 py-3 tabular-nums text-slate-600">
                  {formatter.format(n.scheduledFor)}
                </td>
                <td className="px-4 py-3 text-slate-800">
                  {n.appointment?.client.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {TEMPLATE_LABELS[n.template] ?? n.template}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {CHANNEL_LABELS[n.channel] ?? n.channel}
                </td>
                <td className="px-4 py-3 text-slate-500">{n.recipient}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[n.status] ?? "bg-slate-100 text-slate-600"}`}
                  >
                    {STATUS_LABELS_N[n.status] ?? n.status}
                  </span>
                  {n.lastError && (
                    <p className="mt-1 max-w-48 text-xs text-slate-400">
                      {n.lastError}
                    </p>
                  )}
                </td>
              </tr>
            ))}
            {notifications.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Aún no hay notificaciones. Se generan al crear o cancelar
                  citas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
