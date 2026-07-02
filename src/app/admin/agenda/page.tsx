import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getDayAgenda } from "@/lib/domain/stats";
import { addDaysISO, toLocalDateISO, toLocalTime, isValidDateISO } from "@/lib/domain/dates";
import { formatCents } from "@/lib/money";
import { StatusBadge } from "@/components/status-badge";
import { AppointmentActions } from "@/components/admin/appointment-actions";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

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
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Agenda</h1>
          <p className="mt-1 text-sm capitalize text-ink-muted">{dayLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/agenda?fecha=${addDaysISO(day, -1)}`}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Anterior
          </Link>
          {day !== today && (
            <Link
              href="/admin/agenda"
              className={buttonClasses({ variant: "ghost", size: "sm" })}
            >
              Hoy
            </Link>
          )}
          <Link
            href={`/admin/agenda?fecha=${addDaysISO(day, 1)}`}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            Siguiente
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>

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
          </Card>
        ))}
        {agenda.length === 0 && (
          <EmptyState icon={CalendarDays} title="No hay citas para este día." />
        )}
      </div>
    </div>
  );
}
