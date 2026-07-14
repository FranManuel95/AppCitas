import Link from "next/link";
import { Briefcase, CalendarDays, User } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/guards";
import { fmt, getDict, intlLocale } from "@/lib/i18n";
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
import { CalendarConnectCard } from "@/components/calendar-connect-card";
import { SelfTimeOff } from "@/components/staff/self-time-off";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi agenda" };

// Portal del empleado: su agenda del día, con acciones sobre sus citas.
export default async function StaffPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const staff = await requireStaff();
  const { locale, t } = await getDict();
  const { fecha } = await searchParams;

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: staff.businessId },
    select: { name: true, timezone: true, currency: true },
  });

  const today = toLocalDateISO(new Date(), business.timezone);
  const day = fecha && isValidDateISO(fecha) ? fecha : today;
  const dayStart = wallTimeToUtc(day, "00:00", business.timezone);
  const dayEnd = wallTimeToUtc(addDaysISO(day, 1), "00:00", business.timezone);

  const calendarConnection = await prisma.calendarConnection.findFirst({
    where: { businessId: staff.businessId, staffId: staff.staffId },
    select: { googleEmail: true, status: true, simulated: true },
  });

  // Ausencias propias (autogestión): futuras primero.
  const timeOff = await prisma.staffTimeOff.findMany({
    where: { staffId: staff.staffId },
    orderBy: { startDate: "desc" },
    take: 50,
    select: { id: true, startDate: true, endDate: true, reason: true },
  });
  const timeOffLabels =
    locale === "es"
      ? {
          title: "Mis ausencias",
          hint: "Vacaciones o días libres: no se te asignarán citas en ese rango.",
          from: "Desde",
          to: "Hasta",
          reason: "Motivo (opcional)",
          add: "Añadir",
          remove: "Quitar",
          empty: "Sin ausencias registradas.",
          error: "No se pudo guardar la ausencia.",
        }
      : {
          title: "My time off",
          hint: "Holidays or days off: no appointments will be assigned in that range.",
          from: "From",
          to: "To",
          reason: "Reason (optional)",
          add: "Add",
          remove: "Remove",
          empty: "No time off recorded.",
          error: "Could not save the time off.",
        };

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
        location: { select: { name: true } },
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
  const dayLabel = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "full",
    timeZone: business.timezone,
  }).format(new Date(`${day}T12:00:00Z`));

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <SectionHeader
          as="h1"
          title={t.admin.personal.title}
          description={
            <>
              {business.name} · {staff.staffName}
              <span className="mt-0.5 block capitalize text-ink-soft">
                {dayLabel}
              </span>
            </>
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/personal?fecha=${addDaysISO(day, -1)}`}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                {t.admin.personal.previous}
              </Link>
              {day !== today && (
                <Link
                  href="/personal"
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                >
                  {t.admin.personal.today}
                </Link>
              )}
              <Link
                href={`/personal?fecha=${addDaysISO(day, 1)}`}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                {t.admin.personal.next}
              </Link>
            </div>
          }
        />

        <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
          {fmt(t.admin.personal.upcomingConfirmed, { count: upcomingCount })}
        </p>

        <div className="mt-6 space-y-3">
          {agenda.map((a) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="w-16 shrink-0 rounded-lg border border-border bg-surface-3 py-2 text-center">
                    <p className="text-base font-semibold tabular-nums text-ink">
                      {toLocalTime(a.startAt, business.timezone)}
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      {a.service.durationMinutes} min
                    </p>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-ink">
                      <User
                        className="h-4 w-4 shrink-0 text-ink-muted"
                        aria-hidden
                      />
                      <span className="truncate">{a.client.name}</span>
                    </p>
                    <p className="flex items-center gap-2 text-sm text-ink-soft">
                      <Briefcase
                        className="h-4 w-4 shrink-0 text-ink-muted"
                        aria-hidden
                      />
                      <span className="min-w-0">
                        {a.service.name} ·{" "}
                        {formatCents(a.priceCents, business.currency)}
                        {a.location && (
                          <span className="ml-1.5 text-xs text-ink-muted">
                            📍 {a.location.name}
                          </span>
                        )}
                      </span>
                    </p>
                    <p className="pl-6 text-xs text-ink-muted">
                      {[a.client.email, a.client.phone]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {a.notes && (
                      <p className="ml-6 mt-1.5 rounded-md bg-surface-3 px-2.5 py-1.5 text-xs text-ink-soft">
                        {a.notes}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <StatusBadge status={a.status} />
                  <AppointmentActions
                    appointmentId={a.id}
                    status={a.status}
                    isPast={a.startAt.getTime() < now}
                    endpointBase="/api/staff/appointments"
                    canCancel={false}
                    labels={t.admin.actions}
                  />
                </div>
              </div>
            </Card>
          ))}
          {agenda.length === 0 && (
            <EmptyState
              icon={CalendarDays}
              title={t.admin.personal.noAppointmentsThatDay}
            />
          )}
        </div>

        <div className="mt-8">
          <SelfTimeOff initial={timeOff} labels={timeOffLabels} />
        </div>

        <div className="mt-8">
          <CalendarConnectCard kind="staff" connection={calendarConnection} />
        </div>
      </main>
    </>
  );
}
