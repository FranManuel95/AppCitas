import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getDayAgenda } from "@/lib/domain/stats";
import { addDaysISO, toLocalDateISO, toLocalTime, isValidDateISO } from "@/lib/domain/dates";
import { formatCents } from "@/lib/money";
import { StatusBadge } from "@/components/status-badge";
import { AppointmentActions } from "@/components/admin/appointment-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda" };

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const admin = await requireBusinessAdmin();
  const { fecha } = await searchParams;
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: admin.businessId },
    select: { timezone: true, currency: true },
  });

  const today = toLocalDateISO(new Date(), business.timezone);
  const day = fecha && isValidDateISO(fecha) ? fecha : today;
  const agenda = await getDayAgenda(admin.businessId, day);
  const now = Date.now();

  const dayLabel = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "full",
    timeZone: business.timezone,
  }).format(new Date(`${day}T12:00:00Z`));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agenda</h1>
          <p className="text-sm capitalize text-slate-500">{dayLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/agenda?fecha=${addDaysISO(day, -1)}`}
            className="btn-secondary"
          >
            ← Anterior
          </Link>
          {day !== today && (
            <Link href="/admin/agenda" className="btn-secondary">
              Hoy
            </Link>
          )}
          <Link
            href={`/admin/agenda?fecha=${addDaysISO(day, 1)}`}
            className="btn-secondary"
          >
            Siguiente →
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {agenda.map((a) => (
          <div key={a.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-4">
                <div className="text-center">
                  <p className="text-lg font-bold tabular-nums text-slate-900">
                    {toLocalTime(a.startAt, business.timezone)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {a.service.durationMinutes} min
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">{a.client.name}</p>
                  <p className="text-sm text-slate-500">
                    {a.service.name} ·{" "}
                    {formatCents(a.priceCents, business.currency)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {[a.client.email, a.client.phone]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {a.notes && (
                    <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                      {a.notes}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge status={a.status} />
                <AppointmentActions
                  appointmentId={a.id}
                  status={a.status}
                  isPast={a.startAt.getTime() < now}
                />
              </div>
            </div>
          </div>
        ))}
        {agenda.length === 0 && (
          <p className="card text-sm text-slate-500">
            No hay citas para este día.
          </p>
        )}
      </div>
    </div>
  );
}
