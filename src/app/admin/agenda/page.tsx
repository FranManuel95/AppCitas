import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getDict } from "@/lib/i18n";
import { getDayAgenda } from "@/lib/domain/stats";
import { getBookableLocations } from "@/lib/domain/locations";
import { addDaysISO, toLocalDateISO, toLocalTime, isValidDateISO } from "@/lib/domain/dates";
import { formatCents } from "@/lib/money";
import { StatusBadge } from "@/components/status-badge";
import { AppointmentActions } from "@/components/admin/appointment-actions";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { NewAppointmentForm } from "@/components/admin/new-appointment-form";
import { InternalNote } from "@/components/admin/internal-note";
import { RescheduleAppointment } from "@/components/reschedule-appointment";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda" };

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const admin = await requireBusinessAdmin();
  const { locale, t } = await getDict();
  const { fecha } = await searchParams;
  const [business, services, staff] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: admin.businessId },
      select: {
        timezone: true,
        currency: true,
        slug: true,
        maxAdvanceBookingDays: true,
      },
    }),
    prisma.service.findMany({
      where: { businessId: admin.businessId, active: true },
      select: { id: true, name: true, durationMinutes: true },
      orderBy: { name: "asc" },
    }),
    prisma.staffMember.findMany({
      where: { businessId: admin.businessId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  // Selector de sede en la cita manual: misma regla que el wizard público
  // (solo con >1 sede activa y equipo)
  const locations = await getBookableLocations(admin.businessId);

  const today = toLocalDateISO(new Date(), business.timezone);
  const day = fecha && isValidDateISO(fecha) ? fecha : today;
  const agenda = await getDayAgenda(admin.businessId, day);
  const now = Date.now();

  const dayLabel = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en", {
    dateStyle: "full",
    timeZone: business.timezone,
  }).format(new Date(`${day}T12:00:00Z`));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t.admin.agenda.title}</h1>
          <p className="mt-1 text-sm capitalize text-ink-muted">{dayLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/agenda?fecha=${addDaysISO(day, -1)}`}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {t.admin.agenda.previous}
          </Link>
          {day !== today && (
            <Link
              href="/admin/agenda"
              className={buttonClasses({ variant: "ghost", size: "sm" })}
            >
              {t.admin.agenda.today}
            </Link>
          )}
          <Link
            href={`/admin/agenda?fecha=${addDaysISO(day, 1)}`}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            {t.admin.agenda.next}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>

      {/* Cita manual: la mayoría de reservas de un negocio local entran por
          teléfono o mostrador; este es su camino de 10 segundos. */}
      {services.length > 0 && (
        <NewAppointmentForm
          services={services}
          staff={staff}
          locations={locations.map((l) => ({ id: l.id, name: l.name }))}
          defaultDate={day}
        />
      )}

      <div className="space-y-3">
        {agenda.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-4">
                <div className="w-16 shrink-0 text-center">
                  <p className="text-lg font-semibold tabular-nums text-ink">
                    {toLocalTime(a.startAt, business.timezone)}
                  </p>
                  <p className="text-xs tabular-nums text-ink-muted">
                    {a.service.durationMinutes} min
                  </p>
                </div>
                <div className="min-w-0 border-l border-border pl-4">
                  <p className="font-medium text-ink">{a.client.name}</p>
                  <p className="text-sm text-ink-soft">
                    {a.service.name} ·{" "}
                    {formatCents(a.priceCents, business.currency)}
                    {a.staff && (
                      <span
                        className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ background: a.staff.color }}
                      >
                        {a.staff.name}
                      </span>
                    )}
                    {a.location && (
                      <span className="ml-2 text-xs text-ink-muted">
                        📍 {a.location.name}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {[a.client.email, a.client.phone]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {a.notes && (
                    <p className="mt-1.5 rounded-md bg-surface-3 px-2 py-1 text-xs text-ink-soft">
                      {a.notes}
                    </p>
                  )}
                  <InternalNote
                    appointmentId={a.id}
                    note={a.internalNote}
                    labels={t.admin.agenda.internalNote}
                  />
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge status={a.status} />
                <AppointmentActions
                  appointmentId={a.id}
                  status={a.status}
                  isPast={a.startAt.getTime() < now}
                  labels={t.admin.actions}
                />
                {/* Mover UNA cita: mismo panel de reprogramación que el
                    cliente, contra la ruta del negocio (sin ventana de plazo) */}
                {a.status === "CONFIRMED" && a.startAt.getTime() > now && (
                  <RescheduleAppointment
                    appointmentId={a.id}
                    businessSlug={business.slug}
                    serviceId={a.serviceId}
                    minDateISO={today}
                    maxDateISO={addDaysISO(
                      today,
                      business.maxAdvanceBookingDays,
                    )}
                    labels={t.myAppointments}
                    endpoint={`/api/admin/appointments/${a.id}/reschedule`}
                  />
                )}
              </div>
            </div>
          </Card>
        ))}
        {agenda.length === 0 && (
          <EmptyState
            icon={CalendarDays}
            title={t.admin.agenda.noAppointmentsThatDay}
            action={
              <Link
                href="/admin/qr"
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                {t.admin.agenda.emptyAction}
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}
