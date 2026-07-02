import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/guards";
import {
  addDaysISO,
  isValidDateISO,
  toLocalDateISO,
  toLocalTime,
  wallTimeToUtc,
} from "@/lib/domain/dates";
import { formatCents } from "@/lib/money";
import { SiteHeader } from "@/components/site-header";
import { StatusBadge } from "@/components/status-badge";
import { AppointmentActions } from "@/components/admin/appointment-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi agenda" };

// Portal del empleado: su agenda del día, con acciones sobre sus citas.
export default async function StaffPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const staff = await requireStaff();
  const { fecha } = await searchParams;

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: staff.businessId },
    select: { name: true, timezone: true, currency: true },
  });

  const today = toLocalDateISO(new Date(), business.timezone);
  const day = fecha && isValidDateISO(fecha) ? fecha : today;
  const dayStart = wallTimeToUtc(day, "00:00", business.timezone);
  const dayEnd = wallTimeToUtc(addDaysISO(day, 1), "00:00", business.timezone);

  const [agenda, upcomingCount] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        businessId: staff.businessId,
        staffId: staff.staffId,
        startAt: { gte: dayStart, lt: dayEnd },
      },
      include: {
        service: { select: { name: true, durationMinutes: true } },
        client: { select: { name: true, email: true, phone: true } },
      },
      orderBy: { startAt: "asc" },
    }),
    prisma.appointment.count({
      where: {
        businessId: staff.businessId,
        staffId: staff.staffId,
        status: "CONFIRMED",
        startAt: { gt: new Date() },
      },
    }),
  ]);

  const now = Date.now();
  const dayLabel = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "full",
    timeZone: business.timezone,
  }).format(new Date(`${day}T12:00:00Z`));

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">
              {business.name} · {staff.staffName}
            </p>
            <h1 className="text-2xl font-bold text-slate-900">Mi agenda</h1>
            <p className="text-sm capitalize text-slate-500">{dayLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/personal?fecha=${addDaysISO(day, -1)}`}
              className="btn-secondary"
            >
              ← Anterior
            </Link>
            {day !== today && (
              <Link href="/personal" className="btn-secondary">
                Hoy
              </Link>
            )}
            <Link
              href={`/personal?fecha=${addDaysISO(day, 1)}`}
              className="btn-secondary"
            >
              Siguiente →
            </Link>
          </div>
        </div>

        <p className="mt-2 text-sm text-slate-500">
          Tienes {upcomingCount} citas confirmadas próximamente.
        </p>

        <div className="mt-6 space-y-3">
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
                    <p className="font-medium text-slate-900">
                      {a.client.name}
                    </p>
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
                    endpointBase="/api/staff/appointments"
                    canCancel={false}
                  />
                </div>
              </div>
            </div>
          ))}
          {agenda.length === 0 && (
            <p className="card text-sm text-slate-500">
              No tienes citas este día.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
