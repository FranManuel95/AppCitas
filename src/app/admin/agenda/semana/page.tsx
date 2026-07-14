import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { getDict } from "@/lib/i18n";
import { getWeekAgenda } from "@/lib/domain/stats";
import {
  addDaysISO,
  isValidDateISO,
  toLocalDateISO,
  toLocalTime,
  weekdayOfDateISO,
} from "@/lib/domain/dates";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda semanal" };

const HOUR_REM = 3; // alto de una hora en la rejilla

function mondayOf(dateISO: string): string {
  // weekdayOfDateISO: 0=domingo … 6=sábado → retroceder al lunes
  const back = (weekdayOfDateISO(dateISO) + 6) % 7;
  return addDaysISO(dateISO, -back);
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Vista semanal de solo lectura: semana × empleado, con cada cita como bloque
// posicionado por su hora local. Actuar sobre una cita = click → vista diaria.
export default async function AgendaSemanalPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  const admin = await requireBusinessAdmin();
  const { locale, t } = await getDict();
  const { semana } = await searchParams;

  const [business, staff] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: admin.businessId },
      select: { timezone: true, hours: true },
    }),
    prisma.staffMember.findMany({
      where: { businessId: admin.businessId, active: true },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const today = toLocalDateISO(new Date(), business.timezone);
  const monday = mondayOf(
    semana && isValidDateISO(semana) ? semana : today,
  );
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i));
  const agenda = await getWeekAgenda(admin.businessId, monday);

  // Franja horaria visible: del primer al último tramo del horario semanal
  // (fallback 08–20 si el negocio aún no configuró horario)
  const opens = business.hours.map((h) => minutesOf(h.openTime));
  const closes = business.hours.map((h) => minutesOf(h.closeTime));
  const startHour = opens.length > 0 ? Math.floor(Math.min(...opens) / 60) : 8;
  const endHour = closes.length > 0 ? Math.ceil(Math.max(...closes) / 60) : 20;
  const totalRem = (endHour - startHour) * HOUR_REM;

  // Citas agrupadas por día local; posición por hora local del negocio
  const byDay = new Map<string, typeof agenda>();
  for (const a of agenda) {
    const day = toLocalDateISO(a.startAt, business.timezone);
    byDay.set(day, [...(byDay.get(day) ?? []), a]);
  }
  const staffIndex = new Map(staff.map((s, i) => [s.id, i]));
  const columns = Math.max(1, staff.length);

  const dayFmt = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en", {
    weekday: "short",
    day: "numeric",
    timeZone: business.timezone,
  });
  const weekLabel = `${monday} – ${addDaysISO(monday, 6)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {t.admin.agenda.weeklyTitle}
          </h1>
          <p className="mt-1 text-sm tabular-nums text-ink-muted">{weekLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/agenda/semana?semana=${addDaysISO(monday, -7)}`}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {t.admin.agenda.previous}
          </Link>
          {mondayOf(today) !== monday && (
            <Link
              href="/admin/agenda/semana"
              className={buttonClasses({ variant: "ghost", size: "sm" })}
            >
              {t.admin.agenda.today}
            </Link>
          )}
          <Link
            href={`/admin/agenda/semana?semana=${addDaysISO(monday, 7)}`}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            {t.admin.agenda.next}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/admin/agenda"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            {t.admin.agenda.dailyView}
          </Link>
        </div>
      </div>

      {staff.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-soft">
          {staff.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: s.color }}
              />
              {s.name}
            </span>
          ))}
        </div>
      )}

      <Card className="overflow-x-auto p-0">
        <div className="min-w-[56rem]">
          {/* Cabecera de días */}
          <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-border">
            <div />
            {days.map((day) => (
              <Link
                key={day}
                href={`/admin/agenda?fecha=${day}`}
                className={`border-l border-border px-2 py-2 text-center text-xs font-medium capitalize hover:bg-surface-2 ${
                  day === today ? "text-brand-700" : "text-ink-soft"
                }`}
              >
                {dayFmt.format(new Date(`${day}T12:00:00Z`))}
              </Link>
            ))}
          </div>

          {/* Rejilla horaria */}
          <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
            {/* Raíl de horas */}
            <div className="relative" style={{ height: `${totalRem}rem` }}>
              {Array.from({ length: endHour - startHour - 1 }, (_, i) => (
                <span
                  key={i}
                  className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-ink-muted"
                  style={{ top: `${(i + 1) * HOUR_REM}rem` }}
                >
                  {`${String(startHour + i + 1).padStart(2, "0")}:00`}
                </span>
              ))}
            </div>
            {days.map((day) => {
              const items = byDay.get(day) ?? [];
              return (
                <div
                  key={day}
                  className="relative border-l border-border"
                  style={{ height: `${totalRem}rem` }}
                >
                  {/* Líneas de hora */}
                  {Array.from({ length: endHour - startHour - 1 }, (_, i) => (
                    <div
                      key={i}
                      className="absolute inset-x-0 border-t border-border/50"
                      style={{ top: `${(i + 1) * HOUR_REM}rem` }}
                    />
                  ))}
                  {items.map((a) => {
                    const startMin = minutesOf(
                      toLocalTime(a.startAt, business.timezone),
                    );
                    const durMin = Math.max(
                      15,
                      (a.endAt.getTime() - a.startAt.getTime()) / 60_000,
                    );
                    const top = ((startMin - startHour * 60) / 60) * HOUR_REM;
                    const height = (durMin / 60) * HOUR_REM;
                    const col = a.staff ? staffIndex.get(a.staff.id) : null;
                    const width = col === null ? 100 : 100 / columns;
                    const left = col === null ? 0 : (col ?? 0) * width;
                    const color = a.staff?.color ?? a.service.color;
                    return (
                      <Link
                        key={a.id}
                        href={`/admin/agenda?fecha=${day}`}
                        title={`${toLocalTime(a.startAt, business.timezone)} · ${a.client.name} · ${a.service.name}${a.location ? ` · 📍 ${a.location.name}` : ""}`}
                        className={`absolute overflow-hidden rounded-md px-1.5 py-0.5 text-[10px] leading-tight text-white shadow-sm hover:opacity-90 ${
                          a.staff ? "" : "opacity-70"
                        }`}
                        style={{
                          top: `${Math.max(0, top)}rem`,
                          height: `${Math.min(height, totalRem - Math.max(0, top))}rem`,
                          left: `calc(${left}% + 1px)`,
                          width: `calc(${width}% - 2px)`,
                          background: color,
                        }}
                      >
                        <span className="block truncate font-medium">
                          {toLocalTime(a.startAt, business.timezone)}{" "}
                          {a.client.name}
                        </span>
                        <span className="block truncate opacity-90">
                          {a.service.name}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {agenda.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title={t.admin.agenda.noAppointmentsThatWeek}
        />
      )}
    </div>
  );
}
