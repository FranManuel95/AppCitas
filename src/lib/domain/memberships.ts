import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { toLocalDateISO, wallTimeToUtc } from "./dates";
import { BLOCKING_STATUSES } from "./types";

// Beneficio de la membresía al reservar. Precedencia SIN acumulación:
// bono > cupón > membresía > última hora (la membresía solo se aplica si la
// cita no usa bono ni cupón, y anula el descuento de última hora).

export interface MembershipBenefit {
  membershipId: string;
  discountPercent: number;
}

/**
 * Membresía con beneficio vigente del cliente en el negocio, si la hay y le
 * queda cupo este mes. Se llama DENTRO de la transacción de reserva (bajo el
 * advisory lock del negocio): el conteo del tope mensual ve las reservas
 * concurrentes y no se cuelan dos citas en la última plaza del mes.
 *
 * Vigencia: status active, o canceled con el periodo ya pagado aún vigente.
 * past_due NO aplica (el beneficio se recupera al ponerse al día).
 */
export async function activeMembershipBenefitTx(
  tx: Prisma.TransactionClient,
  params: {
    businessId: string;
    clientId: string;
    startAt: Date;
    timezone: string;
    now: Date;
  },
): Promise<MembershipBenefit | null> {
  const { businessId, clientId, startAt, timezone, now } = params;
  const membership = await tx.clientMembership.findFirst({
    where: {
      businessId,
      clientId,
      plan: { active: true },
      OR: [
        { status: "active" },
        { status: "canceled", currentPeriodEnd: { gt: now } },
      ],
    },
    include: {
      plan: { select: { discountPercent: true, maxAppointmentsPerMonth: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!membership) return null;

  const cap = membership.plan.maxAppointmentsPerMonth;
  if (cap !== null) {
    // Mes natural (zona del negocio) de la CITA que se está reservando
    const month = toLocalDateISO(startAt, timezone).slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    const monthStart = wallTimeToUtc(`${month}-01`, "00:00", timezone);
    const next = new Date(Date.UTC(y, m, 1));
    const nextMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthEnd = wallTimeToUtc(`${nextMonth}-01`, "00:00", timezone);

    const used = await tx.appointment.count({
      where: {
        membershipId: membership.id,
        status: { in: [...BLOCKING_STATUSES] },
        startAt: { gte: monthStart, lt: monthEnd },
      },
    });
    // Tope agotado: la cita sale a precio normal, sin rechazar la reserva
    if (used >= cap) return null;
  }

  return {
    membershipId: membership.id,
    discountPercent: membership.plan.discountPercent,
  };
}

/** Membresías vivas de un cliente para "Mis citas" (con plan y negocio). */
export async function getClientMemberships(clientId: string, now = new Date()) {
  return prisma.clientMembership.findMany({
    where: {
      clientId,
      OR: [
        { status: { in: ["active", "past_due"] } },
        // Canceladas: solo mientras conserven beneficio (periodo pagado)
        { status: "canceled", currentPeriodEnd: { gt: now } },
      ],
    },
    include: {
      plan: {
        select: {
          name: true,
          priceCents: true,
          discountPercent: true,
          maxAppointmentsPerMonth: true,
        },
      },
      business: { select: { name: true, slug: true, currency: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
