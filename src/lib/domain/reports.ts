import { prisma } from "@/lib/prisma";
import {
  addDaysISO,
  toLocalDateISO,
  wallTimeToUtc,
  weekdayOfDateISO,
} from "./dates";
import { BLOCKING_STATUSES } from "./types";

// Informes avanzados del negocio: cohortes de retención, ventas por servicio,
// rendimiento de promociones y mapa de calor de ocupación. Los builders son
// funciones puras (testables sin BD); los loaders acotan las filas leídas al
// rango pedido y a columnas estrechas.

export interface DateRange {
  from: Date;
  to: Date; // exclusivo
}

const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Rango de fechas de los informes a partir de los parámetros de la URL
 * (días completos en la zona del negocio). Por defecto: los últimos 12 meses.
 */
export function resolveReportRange(
  desde: string | undefined,
  hasta: string | undefined,
  timezone: string,
  now = new Date(),
): DateRange & { fromISO: string; toISO: string } {
  const todayISO = toLocalDateISO(now, timezone);
  const toISO = hasta && DATE_ISO_RE.test(hasta) ? hasta : todayISO;
  const defaultFrom = addDaysISO(toISO, -365);
  let fromISO = desde && DATE_ISO_RE.test(desde) ? desde : defaultFrom;
  if (fromISO > toISO) fromISO = toISO;
  return {
    from: wallTimeToUtc(fromISO, "00:00", timezone),
    to: wallTimeToUtc(addDaysISO(toISO, 1), "00:00", timezone),
    fromISO,
    toISO,
  };
}

// ── Cohortes de retención ─────────────────────────────────────────────────────
// Por mes de PRIMERA visita completada: cuántos clientes nuevos y qué % volvió
// (otra cita completada entre 1 y 90 días después de la primera).

export interface RetentionCohort {
  month: string; // "YYYY-MM" de la primera visita
  newClients: number;
  returned: number;
  retentionPercent: number | null; // null si la cohorte aún no tiene 90 días
}

const RETURN_WINDOW_DAYS = 90;

export function buildRetentionCohorts(
  visits: Array<{ clientId: string; startAt: Date }>,
  timezone: string,
  now: Date,
): RetentionCohort[] {
  // Primera visita y visitas posteriores por cliente
  const firstByClient = new Map<string, Date>();
  for (const v of visits) {
    const current = firstByClient.get(v.clientId);
    if (!current || v.startAt < current) firstByClient.set(v.clientId, v.startAt);
  }
  const returnedClients = new Set<string>();
  for (const v of visits) {
    const first = firstByClient.get(v.clientId)!;
    const diffDays = (v.startAt.getTime() - first.getTime()) / 86_400_000;
    if (diffDays > 0 && diffDays <= RETURN_WINDOW_DAYS) {
      returnedClients.add(v.clientId);
    }
  }

  const cohorts = new Map<string, { newClients: number; returned: number; matured: boolean }>();
  for (const [clientId, first] of firstByClient) {
    const month = toLocalDateISO(first, timezone).slice(0, 7);
    const cohort = cohorts.get(month) ?? {
      newClients: 0,
      returned: 0,
      matured: false,
    };
    cohort.newClients++;
    if (returnedClients.has(clientId)) cohort.returned++;
    cohorts.set(month, cohort);
  }
  // Una cohorte es "madura" cuando su ventana de retorno ya pasó entera:
  // el % de cohortes recientes se marca provisional (null si son de este mes)
  for (const [month, cohort] of cohorts) {
    const [y, m] = month.split("-").map(Number);
    const monthEnd = Date.UTC(y, m, 1); // inicio del mes siguiente (aprox. UTC)
    cohort.matured =
      now.getTime() - monthEnd >= RETURN_WINDOW_DAYS * 86_400_000;
  }

  return [...cohorts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, c]) => ({
      month,
      newClients: c.newClients,
      returned: c.returned,
      retentionPercent:
        c.newClients > 0 ? Math.round((c.returned / c.newClients) * 100) : null,
    }));
}

export async function getRetentionCohorts(
  businessId: string,
  now = new Date(),
): Promise<RetentionCohort[]> {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { timezone: true },
  });
  // Filas estrechas (clientId, startAt) de visitas completadas: el volumen es
  // asumible para un negocio de servicios (decenas de miles como mucho).
  const visits = await prisma.appointment.findMany({
    where: { businessId, status: "COMPLETED" },
    select: { clientId: true, startAt: true },
  });
  return buildRetentionCohorts(visits, business.timezone, now);
}

// ── Ventas por servicio (tabla completa) ─────────────────────────────────────

export interface ServiceReportRow {
  serviceId: string;
  name: string;
  total: number;
  completed: number;
  noShows: number;
  revenueCents: number;
  avgTicketCents: number | null; // ingreso medio por cita completada
  noShowPercent: number | null; // no-shows / (completadas + no-shows)
}

export async function getServiceReport(
  businessId: string,
  range: DateRange,
): Promise<ServiceReportRow[]> {
  const [rows, services] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["serviceId", "status"],
      where: { businessId, startAt: { gte: range.from, lt: range.to } },
      _count: { _all: true },
      _sum: { chargedCents: true },
    }),
    prisma.service.findMany({
      where: { businessId },
      select: { id: true, name: true },
    }),
  ]);
  const nameById = new Map(services.map((s) => [s.id, s.name]));

  const byService = new Map<string, ServiceReportRow>();
  for (const row of rows) {
    const entry = byService.get(row.serviceId) ?? {
      serviceId: row.serviceId,
      name: nameById.get(row.serviceId) ?? "(servicio eliminado)",
      total: 0,
      completed: 0,
      noShows: 0,
      revenueCents: 0,
      avgTicketCents: null,
      noShowPercent: null,
    };
    entry.total += row._count._all;
    entry.revenueCents += row._sum.chargedCents ?? 0;
    if (row.status === "COMPLETED") entry.completed += row._count._all;
    if (row.status === "NO_SHOW") entry.noShows += row._count._all;
    byService.set(row.serviceId, entry);
  }

  return [...byService.values()]
    .map((e) => ({
      ...e,
      avgTicketCents:
        e.completed > 0 ? Math.round(e.revenueCents / e.completed) : null,
      noShowPercent:
        e.completed + e.noShows > 0
          ? Math.round((e.noShows / (e.completed + e.noShows)) * 100)
          : null,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents);
}

// ── Rendimiento de promociones ───────────────────────────────────────────────

export interface CouponReportRow {
  couponId: string;
  code: string;
  active: boolean;
  uses: number; // citas que lo aplicaron en el rango
  discountCents: number; // descuento total concedido
  revenueCents: number; // cobrado en esas citas
}

export interface PackageReportRow {
  packageId: string;
  name: string;
  active: boolean;
  sold: number;
  revenueCents: number; // pagado por los bonos vendidos
  sessionsTotal: number; // sesiones vendidas (bonos × sesiones)
  sessionsUsed: number; // consumidas hasta hoy
}

export async function getPromotionsReport(
  businessId: string,
  range: DateRange,
): Promise<{ coupons: CouponReportRow[]; packages: PackageReportRow[] }> {
  const [coupons, couponUsage, packages, purchases] = await Promise.all([
    prisma.coupon.findMany({
      where: { businessId },
      select: { id: true, code: true, active: true },
    }),
    prisma.appointment.groupBy({
      by: ["couponId"],
      where: {
        businessId,
        couponId: { not: null },
        startAt: { gte: range.from, lt: range.to },
      },
      _count: { _all: true },
      _sum: { discountCents: true, chargedCents: true },
    }),
    prisma.package.findMany({
      where: { businessId },
      select: { id: true, name: true, active: true, sessions: true },
    }),
    prisma.clientPackage.groupBy({
      by: ["packageId"],
      where: { businessId, createdAt: { gte: range.from, lt: range.to } },
      _count: { _all: true },
      _sum: { pricePaidCents: true, remainingSessions: true },
    }),
  ]);

  const usageById = new Map(couponUsage.map((u) => [u.couponId, u]));
  const couponRows: CouponReportRow[] = coupons
    .map((c) => {
      const u = usageById.get(c.id);
      return {
        couponId: c.id,
        code: c.code,
        active: c.active,
        uses: u?._count._all ?? 0,
        discountCents: u?._sum.discountCents ?? 0,
        revenueCents: u?._sum.chargedCents ?? 0,
      };
    })
    .sort((a, b) => b.uses - a.uses);

  const purchasesById = new Map(purchases.map((p) => [p.packageId, p]));
  const packageRows: PackageReportRow[] = packages
    .map((p) => {
      const bought = purchasesById.get(p.id);
      const sold = bought?._count._all ?? 0;
      const sessionsTotal = sold * p.sessions;
      const remaining = bought?._sum.remainingSessions ?? 0;
      return {
        packageId: p.id,
        name: p.name,
        active: p.active,
        sold,
        revenueCents: bought?._sum.pricePaidCents ?? 0,
        sessionsTotal,
        sessionsUsed: Math.max(0, sessionsTotal - remaining),
      };
    })
    .sort((a, b) => b.revenueCents - a.revenueCents);

  return { coupons: couponRows, packages: packageRows };
}

// ── Mapa de calor de ocupación (día de la semana × hora) ─────────────────────

export interface HeatmapCell {
  weekday: number; // 0=domingo … 6=sábado (convención de weekdayOfDateISO)
  hour: number; // 0..23, hora local del negocio
  count: number;
}

export function buildOccupancyHeatmap(
  appointments: Array<{ startAt: Date }>,
  timezone: string,
): { cells: HeatmapCell[]; max: number } {
  const hourFmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone: timezone,
  });
  const counts = new Map<string, number>();
  for (const a of appointments) {
    const weekday = weekdayOfDateISO(toLocalDateISO(a.startAt, timezone));
    const hour = Number(hourFmt.format(a.startAt)) % 24;
    const key = `${weekday}:${hour}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const cells: HeatmapCell[] = [];
  let max = 0;
  for (const [key, count] of counts) {
    const [weekday, hour] = key.split(":").map(Number);
    cells.push({ weekday, hour, count });
    if (count > max) max = count;
  }
  return { cells, max };
}

export async function getOccupancyHeatmap(
  businessId: string,
  range: DateRange,
): Promise<{ cells: HeatmapCell[]; max: number }> {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { timezone: true },
  });
  const appointments = await prisma.appointment.findMany({
    where: {
      businessId,
      status: { in: [...BLOCKING_STATUSES] }, // CONFIRMED + COMPLETED
      startAt: { gte: range.from, lt: range.to },
    },
    select: { startAt: true },
  });
  return buildOccupancyHeatmap(appointments, business.timezone);
}
