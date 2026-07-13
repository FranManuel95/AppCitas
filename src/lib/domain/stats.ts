import { prisma } from "@/lib/prisma";
import { addDaysISO, toLocalDateISO, weekdayOfDateISO, wallTimeToUtc } from "./dates";
import { BLOCKING_STATUSES, type AppointmentStatus } from "./types";

// Agregados del dashboard, calculados EN LA BASE DE DATOS (groupBy/count/sum
// sobre los índices businessId+startAt y businessId+status+startAt). Las filas
// transferidas son O(estados×12 + servicios + clientes + citas del mes actual),
// independientes del histórico total: el dashboard escala aunque el negocio
// acumule cientos de miles de citas. Portable entre SQLite y PostgreSQL (API
// Prisma, sin SQL crudo).

export interface MonthlyPoint {
  month: string; // "YYYY-MM"
  // Total cobrado: citas y cargos + venta de bonos del mes
  revenueCents: number;
  packageRevenueCents: number;
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
    include: {
      hours: true,
      closures: true,
      staff: { where: { active: true }, include: { hours: true } },
    },
  });
  const tz = business.timezone;

  // Últimos 12 meses naturales (incluido el actual) + citas futuras. Cada mes
  // se materializa como intervalo UTC [inicio, fin) según la zona del negocio.
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
  const monthStartOf = (month: string) =>
    wallTimeToUtc(`${month}-01`, "00:00", tz);
  const nextMonthOf = (month: string) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m, 1)); // mes+1 (Date normaliza)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const windowStart = monthStartOf(months[0]);
  const currentMonthStart = monthStartOf(currentMonth);
  const currentMonthEnd = monthStartOf(nextMonthOf(currentMonth));

  const [
    statusRows,
    serviceRows,
    clientRows,
    upcomingConfirmed,
    perMonthRows,
    currentMonthBlocking,
    packageSales,
    serviceInfo,
  ] = await Promise.all([
    // Desglose por estado de toda la ventana (incluye citas futuras)
    prisma.appointment.groupBy({
      by: ["status"],
      where: { businessId, startAt: { gte: windowStart } },
      _count: { _all: true },
    }),
    // Uso e ingreso por servicio (para el top 5)
    prisma.appointment.groupBy({
      by: ["serviceId"],
      where: { businessId, startAt: { gte: windowStart } },
      _count: { _all: true },
      _sum: { chargedCents: true },
    }),
    // Clientes únicos: una fila estrecha por cliente, no por cita
    prisma.appointment.groupBy({
      by: ["clientId"],
      where: { businessId, startAt: { gte: windowStart } },
    }),
    prisma.appointment.count({
      where: { businessId, status: "CONFIRMED", startAt: { gt: now } },
    }),
    // Serie mensual: 12 agregados acotados por [inicio, fin) de cada mes
    Promise.all(
      months.map((month) =>
        prisma.appointment.groupBy({
          by: ["status"],
          where: {
            businessId,
            startAt: { gte: monthStartOf(month), lt: monthStartOf(nextMonthOf(month)) },
          },
          _count: { _all: true },
          _sum: { chargedCents: true },
        }),
      ),
    ),
    // Ocupación: solo las citas que bloquean agenda del mes ACTUAL (acotado)
    prisma.appointment.findMany({
      where: {
        businessId,
        status: { in: [...BLOCKING_STATUSES] },
        startAt: { gte: currentMonthStart, lt: currentMonthEnd },
      },
      select: { startAt: true, endAt: true },
    }),
    prisma.clientPackage.findMany({
      where: { businessId, createdAt: { gte: windowStart } },
      select: { createdAt: true, pricePaidCents: true },
    }),
    // Nombre y color de los servicios del negocio (para etiquetar el top 5)
    prisma.service.findMany({
      where: { businessId },
      select: { id: true, name: true, color: true },
    }),
  ]);

  const byMonth = new Map<string, MonthlyPoint>(
    months.map((m) => [
      m,
      {
        month: m,
        revenueCents: 0,
        packageRevenueCents: 0,
        completed: 0,
        cancelled: 0,
        cancelledLate: 0,
        noShow: 0,
        total: 0,
      },
    ]),
  );

  let monthRevenueCents = 0;
  let monthAppointments = 0;
  let monthLateCancellations = 0;
  let monthLateChargesCents = 0;

  months.forEach((month, i) => {
    const point = byMonth.get(month)!;
    for (const row of perMonthRows[i]) {
      const status = row.status as AppointmentStatus;
      const count = row._count._all;
      const charged = row._sum.chargedCents ?? 0;
      point.total += count;
      point.revenueCents += charged;
      if (status === "COMPLETED") point.completed += count;
      if (status === "CANCELLED") point.cancelled += count;
      if (status === "CANCELLED_LATE") point.cancelledLate += count;
      if (status === "NO_SHOW") point.noShow += count;

      if (month === currentMonth) {
        monthRevenueCents += charged;
        monthAppointments += count;
        if (status === "CANCELLED_LATE" || status === "NO_SHOW") {
          monthLateCancellations += count;
          monthLateChargesCents += charged;
        }
      }
    }
  });

  let monthBookedMinutes = 0;
  for (const a of currentMonthBlocking) {
    monthBookedMinutes += (a.endAt.getTime() - a.startAt.getTime()) / 60_000;
  }

  const serviceLabel = new Map(serviceInfo.map((s) => [s.id, s]));
  const topServices: ServiceStat[] = serviceRows
    .map((row) => ({
      serviceId: row.serviceId,
      name: serviceLabel.get(row.serviceId)?.name ?? "(servicio eliminado)",
      color: serviceLabel.get(row.serviceId)?.color ?? "#94a3b8",
      count: row._count._all,
      revenueCents: row._sum.chargedCents ?? 0,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, 5);

  // Venta de bonos: ingreso del mes en que se compran
  for (const sale of packageSales) {
    const month = monthOf(sale.createdAt, tz);
    const point = byMonth.get(month);
    if (point) {
      point.packageRevenueCents += sale.pricePaidCents;
      point.revenueCents += sale.pricePaidCents;
    }
    if (month === currentMonth) {
      monthRevenueCents += sale.pricePaidCents;
    }
  }

  // Minutos abiertos del mes actual según horario semanal (menos cierres).
  // Con equipo, la capacidad real es la suma de los horarios de cada empleado
  // (propio o heredado del negocio); sin equipo, el horario del negocio.
  const closedDates = new Set(business.closures.map((c) => c.date));
  let monthOpenMinutes = 0;
  {
    const [y, m] = currentMonth.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateISO = `${currentMonth}-${String(d).padStart(2, "0")}`;
      if (closedDates.has(dateISO)) continue;
      const weekday = weekdayOfDateISO(dateISO);
      const businessDayRanges = business.hours.filter(
        (x) => x.weekday === weekday,
      );

      if (business.staff.length > 0) {
        for (const member of business.staff) {
          const ranges =
            member.hours.length > 0
              ? member.hours.filter((x) => x.weekday === weekday)
              : businessDayRanges;
          for (const h of ranges) {
            monthOpenMinutes += minutesOfRange(h.openTime, h.closeTime);
          }
        }
      } else {
        for (const h of businessDayRanges) {
          monthOpenMinutes += minutesOfRange(h.openTime, h.closeTime);
        }
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
    uniqueClients: clientRows.length,
    monthly: [...byMonth.values()],
    topServices,
    statusBreakdown: statusRows.map((row) => ({
      status: row.status as AppointmentStatus,
      count: row._count._all,
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
      staff: { select: { id: true, name: true, color: true } },
      location: { select: { name: true } },
    },
    orderBy: { startAt: "asc" },
  });
}
