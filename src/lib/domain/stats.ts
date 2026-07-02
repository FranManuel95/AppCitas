import { prisma } from "@/lib/prisma";
import { addDaysISO, toLocalDateISO, weekdayOfDateISO, wallTimeToUtc } from "./dates";
import { BLOCKING_STATUSES, type AppointmentStatus } from "./types";

// Agregados del dashboard. Se calculan en JS sobre una única consulta acotada
// por fecha (índice businessId+startAt): portable entre SQLite y PostgreSQL.
// Si un negocio acumulase cientos de miles de citas, estos agregados se
// materializarían con GROUP BY nativo o una tabla de resumen.

export interface MonthlyPoint {
  month: string; // "YYYY-MM"
  revenueCents: number;
  completed: number;
  cancelled: number;
  cancelledLate: number;
  noShow: number;
  total: number;
}

export interface ServiceStat {
  serviceId: string;
  name: string;
  color: string;
  count: number;
  revenueCents: number;
}

export interface DashboardStats {
  monthRevenueCents: number;
  monthAppointments: number;
  monthLateCancellations: number;
  monthLateChargesCents: number;
  upcomingConfirmed: number;
  occupancyPercent: number;
  uniqueClients: number;
  monthly: MonthlyPoint[];
  topServices: ServiceStat[];
  statusBreakdown: Array<{ status: AppointmentStatus; count: number }>;
}

function monthOf(instant: Date, timezone: string): string {
  return toLocalDateISO(instant, timezone).slice(0, 7);
}

function minutesOfRange(openTime: string, closeTime: string): number {
  const [oh, om] = openTime.split(":").map(Number);
  const [ch, cm] = closeTime.split(":").map(Number);
  return Math.max(0, ch * 60 + cm - (oh * 60 + om));
}

export async function getDashboardStats(
  businessId: string,
  now = new Date(),
): Promise<DashboardStats> {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    include: { hours: true, closures: true },
  });
  const tz = business.timezone;

  // Últimos 12 meses naturales (incluido el actual) + citas futuras
  const currentMonth = monthOf(now, tz);
  const months: string[] = [];
  {
    const [y, m] = currentMonth.split("-").map(Number);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      months.push(
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      );
    }
  }
  const windowStart = wallTimeToUtc(`${months[0]}-01`, "00:00", tz);

  const appointments = await prisma.appointment.findMany({
    where: { businessId, startAt: { gte: windowStart } },
    select: {
      startAt: true,
      endAt: true,
      status: true,
      chargedCents: true,
      clientId: true,
      serviceId: true,
      service: { select: { name: true, color: true } },
    },
    orderBy: { startAt: "asc" },
  });

  const byMonth = new Map<string, MonthlyPoint>(
    months.map((m) => [
      m,
      {
        month: m,
        revenueCents: 0,
        completed: 0,
        cancelled: 0,
        cancelledLate: 0,
        noShow: 0,
        total: 0,
      },
    ]),
  );
  const byService = new Map<string, ServiceStat>();
  const statusCount = new Map<AppointmentStatus, number>();
  const clients = new Set<string>();

  let monthRevenueCents = 0;
  let monthAppointments = 0;
  let monthLateCancellations = 0;
  let monthLateChargesCents = 0;
  let upcomingConfirmed = 0;
  let monthBookedMinutes = 0;

  for (const a of appointments) {
    const status = a.status as AppointmentStatus;
    const month = monthOf(a.startAt, tz);
    clients.add(a.clientId);
    statusCount.set(status, (statusCount.get(status) ?? 0) + 1);

    const point = byMonth.get(month);
    if (point) {
      point.total += 1;
      point.revenueCents += a.chargedCents;
      if (status === "COMPLETED") point.completed += 1;
      if (status === "CANCELLED") point.cancelled += 1;
      if (status === "CANCELLED_LATE") point.cancelledLate += 1;
      if (status === "NO_SHOW") point.noShow += 1;
    }

    const svc = byService.get(a.serviceId) ?? {
      serviceId: a.serviceId,
      name: a.service.name,
      color: a.service.color,
      count: 0,
      revenueCents: 0,
    };
    svc.count += 1;
    svc.revenueCents += a.chargedCents;
    byService.set(a.serviceId, svc);

    if (month === currentMonth) {
      monthRevenueCents += a.chargedCents;
      monthAppointments += 1;
      if (status === "CANCELLED_LATE" || status === "NO_SHOW") {
        monthLateCancellations += 1;
        monthLateChargesCents += a.chargedCents;
      }
      if (BLOCKING_STATUSES.includes(status)) {
        monthBookedMinutes +=
          (a.endAt.getTime() - a.startAt.getTime()) / 60_000;
      }
    }

    if (status === "CONFIRMED" && a.startAt.getTime() > now.getTime()) {
      upcomingConfirmed += 1;
    }
  }

  // Minutos abiertos del mes actual según horario semanal (menos cierres)
  const closedDates = new Set(business.closures.map((c) => c.date));
  let monthOpenMinutes = 0;
  {
    const [y, m] = currentMonth.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateISO = `${currentMonth}-${String(d).padStart(2, "0")}`;
      if (closedDates.has(dateISO)) continue;
      const weekday = weekdayOfDateISO(dateISO);
      for (const h of business.hours.filter((x) => x.weekday === weekday)) {
        monthOpenMinutes += minutesOfRange(h.openTime, h.closeTime);
      }
    }
  }

  return {
    monthRevenueCents,
    monthAppointments,
    monthLateCancellations,
    monthLateChargesCents,
    upcomingConfirmed,
    occupancyPercent:
      monthOpenMinutes > 0
        ? Math.min(100, Math.round((monthBookedMinutes / monthOpenMinutes) * 100))
        : 0,
    uniqueClients: clients.size,
    monthly: [...byMonth.values()],
    topServices: [...byService.values()]
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 5),
    statusBreakdown: [...statusCount.entries()].map(([status, count]) => ({
      status,
      count,
    })),
  };
}

// Agenda de un día concreto (por defecto hoy) para el panel del negocio.
export async function getDayAgenda(
  businessId: string,
  dateISO?: string,
  now = new Date(),
) {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { timezone: true },
  });
  const day = dateISO ?? toLocalDateISO(now, business.timezone);
  const dayStart = wallTimeToUtc(day, "00:00", business.timezone);
  const dayEnd = wallTimeToUtc(addDaysISO(day, 1), "00:00", business.timezone);

  return prisma.appointment.findMany({
    where: { businessId, startAt: { gte: dayStart, lt: dayEnd } },
    include: {
      service: { select: { name: true, color: true, durationMinutes: true } },
      client: { select: { id: true, name: true, email: true, phone: true } },
    },
    orderBy: { startAt: "asc" },
  });
}
