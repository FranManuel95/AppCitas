import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/domain/errors";
import { BLOCKING_STATUSES } from "@/lib/domain/types";
import { toLocalDateISO, wallTimeToUtc } from "@/lib/domain/dates";

/**
 * Planes SaaS que la plataforma cobra a cada NEGOCIO (B2B). No confundir con el
 * cobro B2C de cancelaciones a los clientes finales (src/lib/payments).
 *
 * Los límites se aplican en dominio (assertWithinPlan) al crear empleados y al
 * reservar citas. `staff` y `monthlyAppointments` = null significa ilimitado.
 */
export type PlanId = "free" | "pro";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceCentsPerMonth: number;
  limits: {
    staff: number | null;
    monthlyAppointments: number | null;
  };
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceCentsPerMonth: 0,
    limits: { staff: 1, monthlyAppointments: 50 },
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceCentsPerMonth: 2900,
    limits: { staff: null, monthlyAppointments: null },
  },
};

export const TRIAL_DAYS = 14;

/** Estados de suscripción que dan acceso a las capacidades del plan de pago. */
const ACTIVE_STATUSES = new Set(["trialing", "active"]);

export function planFor(planId: string): PlanDefinition {
  return PLANS[(planId as PlanId) in PLANS ? (planId as PlanId) : "free"];
}

/**
 * Plan EFECTIVO de un negocio: si la suscripción no está activa/en prueba
 * (p. ej. canceled o past_due), se degrada a los límites del plan free aunque
 * el campo `plan` siga en "pro".
 */
export function effectivePlan(business: {
  plan: string;
  subscriptionStatus: string;
}): PlanDefinition {
  if (!ACTIVE_STATUSES.has(business.subscriptionStatus)) return PLANS.free;
  return planFor(business.plan);
}

export interface PlanUsage {
  staff: number;
  monthlyAppointments: number;
}

// Una cita cuenta para el cupo mensual solo si sigue "viva": las canceladas
// (CANCELLED/CANCELLED_LATE) y los no-shows no penalizan al negocio. Si no,
// reservar y cancelar 50 veces bloquearía la 51ª reserva legítima.
const QUOTA_STATUSES = [...BLOCKING_STATUSES]; // CONFIRMED, COMPLETED

/**
 * Inicio del mes natural EN LA ZONA DEL NEGOCIO, como instante UTC. Contar por
 * mes UTC (como antes) desplaza el corte ~1-2 h respecto al mes local cerca de
 * medianoche del día 1 y mete/saca alguna cita del cubo equivocado.
 */
function monthStartInTz(now: Date, timezone: string): Date {
  const todayISO = toLocalDateISO(now, timezone); // "YYYY-MM-DD" local
  const firstOfMonthISO = `${todayISO.slice(0, 8)}01`; // "YYYY-MM-01"
  return wallTimeToUtc(firstOfMonthISO, "00:00", timezone);
}

/** Uso actual del negocio frente a los límites del plan. */
export async function getPlanUsage(
  businessId: string,
  now = new Date(),
  timezone?: string,
): Promise<PlanUsage> {
  const tz =
    timezone ??
    (
      await prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { timezone: true },
      })
    ).timezone;
  const monthStart = monthStartInTz(now, tz);
  const [staff, monthlyAppointments] = await Promise.all([
    prisma.staffMember.count({ where: { businessId, active: true } }),
    prisma.appointment.count({
      where: {
        businessId,
        createdAt: { gte: monthStart },
        status: { in: QUOTA_STATUSES },
      },
    }),
  ]);
  return { staff, monthlyAppointments };
}

/**
 * Lanza DomainError 402 si crear un recurso más excede el plan efectivo del
 * negocio. `action` decide qué límite se comprueba.
 */
export async function assertWithinPlan(
  businessId: string,
  action: "addStaff" | "createAppointment",
  now = new Date(),
): Promise<void> {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { plan: true, subscriptionStatus: true, timezone: true },
  });
  const plan = effectivePlan(business);
  const usage = await getPlanUsage(businessId, now, business.timezone);

  if (action === "addStaff" && plan.limits.staff !== null) {
    if (usage.staff >= plan.limits.staff) {
      throw new DomainError(
        `Tu plan ${plan.name} permite ${plan.limits.staff} empleado(s). Mejora a Pro para añadir más.`,
        "PLAN_LIMIT_STAFF",
        402,
      );
    }
  }

  if (
    action === "createAppointment" &&
    plan.limits.monthlyAppointments !== null
  ) {
    if (usage.monthlyAppointments >= plan.limits.monthlyAppointments) {
      throw new DomainError(
        `Tu plan ${plan.name} permite ${plan.limits.monthlyAppointments} citas al mes. Mejora a Pro para quitar el límite.`,
        "PLAN_LIMIT_APPOINTMENTS",
        402,
      );
    }
  }
}

/**
 * Comprobación AUTORITATIVA del cupo mensual de citas, hecha DENTRO de la
 * transacción de reserva (tras el advisory lock de lockBusinessForBooking).
 * Cierra la carrera TOCTOU del chequeo de ruta: dos reservas simultáneas ya no
 * pueden leer ambas usage=49 y colarse las dos. Si el plan efectivo no tiene
 * límite mensual (Pro), no consulta el conteo.
 */
export async function assertAppointmentWithinPlanTx(
  tx: Prisma.TransactionClient,
  businessId: string,
  now = new Date(),
): Promise<void> {
  const business = await tx.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { plan: true, subscriptionStatus: true, timezone: true },
  });
  const plan = effectivePlan(business);
  const limit = plan.limits.monthlyAppointments;
  if (limit === null) return;

  const monthStart = monthStartInTz(now, business.timezone);
  const count = await tx.appointment.count({
    where: {
      businessId,
      createdAt: { gte: monthStart },
      status: { in: QUOTA_STATUSES },
    },
  });
  if (count >= limit) {
    throw new DomainError(
      `Tu plan ${plan.name} permite ${limit} citas al mes. Mejora a Pro para quitar el límite.`,
      "PLAN_LIMIT_APPOINTMENTS",
      402,
    );
  }
}

/**
 * Cierra las pruebas caducadas: negocios en `trialing` con `trialEndsAt` en el
 * pasado y sin suscripción de Stripe activa pasan a plan free / estado
 * `canceled`. Se invoca desde el cron. Devuelve cuántos se degradaron.
 */
export async function degradeExpiredTrials(now = new Date()): Promise<{
  degraded: number;
}> {
  const result = await prisma.business.updateMany({
    where: {
      subscriptionStatus: "trialing",
      trialEndsAt: { lt: now },
      platformStripeSubscriptionId: null,
    },
    data: { plan: "free", subscriptionStatus: "canceled" },
  });
  return { degraded: result.count };
}
