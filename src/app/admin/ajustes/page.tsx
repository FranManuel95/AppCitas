import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { SettingsForm } from "@/components/admin/settings-form";
import { LogoutAllButton } from "@/components/logout-all-button";
import { AUDIT_EVENT_LABELS } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const admin = await requireBusinessAdmin();
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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Ajustes</h1>
        <p className="text-sm text-slate-500">
          Datos públicos y política de reservas del negocio.
        </p>
      </div>
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
          slotGranularityMinutes: business.slotGranularityMinutes,
          maxAdvanceBookingDays: business.maxAdvanceBookingDays,
          minNoticeMinutes: business.minNoticeMinutes,
          requireCardToBook: business.requireCardToBook,
          remindersEnabled: business.remindersEnabled,
          reminderHoursBefore: business.reminderHoursBefore,
          notifyByEmail: business.notifyByEmail,
          notifyBySms: business.notifyBySms,
          notifyByWhatsapp: business.notifyByWhatsapp,
          taxId: business.taxId,
          taxPercent: business.taxPercent,
        }}
      />

      {/* Seguridad de la cuenta */}
      <div className="card">
        <h2 className="font-semibold text-slate-900">Seguridad de la cuenta</h2>
        <div className="mt-4">
          <LogoutAllButton />
        </div>
        <h3 className="mt-6 text-sm font-medium text-slate-700">
          Actividad reciente
        </h3>
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
          {activity.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span className="text-slate-700">
                {AUDIT_EVENT_LABELS[entry.event] ?? entry.event}
                {entry.detail && (
                  <span className="text-slate-400"> · {entry.detail}</span>
                )}
              </span>
              <span className="text-xs tabular-nums text-slate-400">
                {entry.ip ? `${entry.ip} · ` : ""}
                {entry.createdAt.toLocaleString("es-ES")}
              </span>
            </li>
          ))}
          {activity.length === 0 && (
            <li className="py-2 text-slate-400">Sin actividad registrada.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
