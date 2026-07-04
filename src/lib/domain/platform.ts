import { prisma } from "@/lib/prisma";
import { PLANS } from "./plans";

// Métricas de la plataforma (para el super-admin). Todo con counts agregados en
// la BD —nada de traer filas— para que escale con el nº de negocios y citas.
// Las fronteras de mes van en UTC (métrica global, sin zona de un negocio).

export interface MonthCount {
  month: string; // "YYYY-MM"
  count: number;
}

export interface PlatformMetrics {
  totalBusinesses: number;
  activeBusinesses: number;
  suspendedBusinesses: number;
  proActive: number;
  trialing: number;
  pastDue: number;
  /** Ingreso recurrente mensual estimado: nº de Pro activos × precio del plan. */
  mrrCents: number;
  totalAppointments: number;
  appointmentsThisMonth: number;
  newBusinessesByMonth: MonthCount[];
  appointmentsByMonth: MonthCount[];
}

function lastMonths(now: Date, count: number): string[] {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }
  return out;
}

function monthStart(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

function nextMonthStart(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1));
}

export async function getPlatformMetrics(
  now = new Date(),
  monthsBack = 6,
): Promise<PlatformMetrics> {
  const months = lastMonths(now, monthsBack);
  const currentMonthStart = monthStart(months[months.length - 1]);

  const [
    totalBusinesses,
    activeBusinesses,
    suspendedBusinesses,
    proActive,
    trialing,
    pastDue,
    totalAppointments,
    appointmentsThisMonth,
    newByMonth,
    apptsByMonth,
  ] = await Promise.all([
    prisma.business.count(),
    prisma.business.count({ where: { active: true } }),
    prisma.business.count({ where: { active: false } }),
    prisma.business.count({
      where: { plan: "pro", subscriptionStatus: "active" },
    }),
    prisma.business.count({ where: { subscriptionStatus: "trialing" } }),
    prisma.business.count({ where: { subscriptionStatus: "past_due" } }),
    prisma.appointment.count(),
    prisma.appointment.count({
      where: { createdAt: { gte: currentMonthStart } },
    }),
    Promise.all(
      months.map((key) =>
        prisma.business.count({
          where: {
            createdAt: { gte: monthStart(key), lt: nextMonthStart(key) },
          },
        }),
      ),
    ),
    Promise.all(
      months.map((key) =>
        prisma.appointment.count({
          where: {
            createdAt: { gte: monthStart(key), lt: nextMonthStart(key) },
          },
        }),
      ),
    ),
  ]);

  return {
    totalBusinesses,
    activeBusinesses,
    suspendedBusinesses,
    proActive,
    trialing,
    pastDue,
    mrrCents: proActive * PLANS.pro.priceCentsPerMonth,
    totalAppointments,
    appointmentsThisMonth,
    newBusinessesByMonth: months.map((month, i) => ({
      month,
      count: newByMonth[i],
    })),
    appointmentsByMonth: months.map((month, i) => ({
      month,
      count: apptsByMonth[i],
    })),
  };
}
