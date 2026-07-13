import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { DomainError } from "./errors";

// Tarjeta de sellos: cada N citas COMPLETADAS en el negocio, el cliente gana
// un cupón personal de descuento (SELLOS-XXXXXX, un solo uso, caduca).
//
// El sello se concede en setAppointmentStatus con un claim atómico sobre
// Appointment.loyaltyStampedAt: aunque el estado cambie varias veces o dos
// procesos coincidan, cada cita sella COMO MUCHO una vez. Al revertir un
// COMPLETED sellado se descuenta el sello; el cupón ya emitido NO se revoca
// (decisión documentada: el premio anunciado no se quita).

export const LOYALTY_COUPON_PREFIX = "SELLOS-";

export interface LoyaltyProgramInput {
  active: boolean;
  stampsRequired: number; // 2..50
  rewardPercent: number; // 1..100 (100 = gratis)
  rewardValidityDays: number; // 7..730
}

export async function upsertLoyaltyProgram(
  businessId: string,
  input: LoyaltyProgramInput,
) {
  if (input.stampsRequired < 2 || input.stampsRequired > 50) {
    throw new DomainError(
      "El número de sellos debe estar entre 2 y 50",
      "LOYALTY_INVALID",
      422,
    );
  }
  if (input.rewardPercent < 1 || input.rewardPercent > 100) {
    throw new DomainError(
      "El premio debe ser un descuento del 1 al 100%",
      "LOYALTY_INVALID",
      422,
    );
  }
  if (input.rewardValidityDays < 7 || input.rewardValidityDays > 730) {
    throw new DomainError(
      "La validez del premio debe estar entre 7 y 730 días",
      "LOYALTY_INVALID",
      422,
    );
  }
  return prisma.loyaltyProgram.upsert({
    where: { businessId },
    create: { businessId, ...input },
    update: input,
  });
}

export async function getLoyaltyProgram(businessId: string) {
  return prisma.loyaltyProgram.findUnique({ where: { businessId } });
}

function couponCode(): string {
  // Alfabeto sin ambigüedades (sin 0/O/1/I/L)
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${LOYALTY_COUPON_PREFIX}${out}`;
}

export interface LoyaltyStampResult {
  stamped: boolean;
  rewardCoupon: { code: string; percent: number; expiresAt: Date } | null;
}

/**
 * Concede (status → COMPLETED) o revierte (COMPLETED → otro) el sello de una
 * cita. Idempotente vía Appointment.loyaltyStampedAt. Best-effort: el fallo
 * se registra y NO rompe la operación de la cita.
 */
export async function syncLoyaltyForStatusChange(params: {
  appointmentId: string;
  businessId: string;
  clientId: string;
  status: string;
  now?: Date;
}): Promise<LoyaltyStampResult> {
  const now = params.now ?? new Date();
  try {
    if (params.status === "COMPLETED") {
      return await stampAppointment(params, now);
    }
    await unstampAppointment(params);
    return { stamped: false, rewardCoupon: null };
  } catch (error) {
    logError("loyalty.sync.failed", error, {
      appointmentId: params.appointmentId,
    });
    return { stamped: false, rewardCoupon: null };
  }
}

async function stampAppointment(
  params: { appointmentId: string; businessId: string; clientId: string },
  now: Date,
): Promise<LoyaltyStampResult> {
  const program = await prisma.loyaltyProgram.findUnique({
    where: { businessId: params.businessId },
  });
  if (!program || !program.active) {
    return { stamped: false, rewardCoupon: null };
  }

  const result = await prisma.$transaction(async (tx) => {
    // Claim atómico: solo un proceso sella esta cita, y solo una vez.
    const claim = await tx.appointment.updateMany({
      where: {
        id: params.appointmentId,
        status: "COMPLETED",
        loyaltyStampedAt: null,
      },
      data: { loyaltyStampedAt: now },
    });
    if (claim.count === 0) return null;

    const card = await tx.loyaltyCard.upsert({
      where: {
        businessId_clientId: {
          businessId: params.businessId,
          clientId: params.clientId,
        },
      },
      create: {
        businessId: params.businessId,
        clientId: params.clientId,
        stamps: 1,
        totalStamps: 1,
      },
      update: { stamps: { increment: 1 }, totalStamps: { increment: 1 } },
    });

    if (card.stamps < program.stampsRequired) {
      return { stamped: true, rewardCoupon: null };
    }

    // Tarjeta completa: se descuentan los sellos y se emite el cupón personal
    await tx.loyaltyCard.update({
      where: { id: card.id },
      data: {
        stamps: { decrement: program.stampsRequired },
        totalRewards: { increment: 1 },
      },
    });
    const expiresAt = new Date(
      now.getTime() + program.rewardValidityDays * 86_400_000,
    );
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = couponCode();
      try {
        await tx.coupon.create({
          data: {
            businessId: params.businessId,
            code,
            type: "PERCENT",
            value: program.rewardPercent,
            active: true,
            maxRedemptions: 1,
            expiresAt,
            clientId: params.clientId,
          },
        });
        return {
          stamped: true,
          rewardCoupon: { code, percent: program.rewardPercent, expiresAt },
        };
      } catch (error) {
        // Colisión de código (unique businessId+code): reintenta con otro
        if (
          attempt < 2 &&
          error instanceof Error &&
          "code" in error &&
          (error as { code?: string }).code === "P2002"
        ) {
          continue;
        }
        throw error;
      }
    }
    return { stamped: true, rewardCoupon: null };
  });

  if (!result) return { stamped: false, rewardCoupon: null };

  // Post-commit: avisar del premio por el outbox (best-effort)
  if (result.rewardCoupon) {
    await enqueueLoyaltyRewardNotification(
      params.businessId,
      params.clientId,
      result.rewardCoupon,
      now,
    );
  }
  return result;
}

async function unstampAppointment(params: {
  appointmentId: string;
  businessId: string;
  clientId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const release = await tx.appointment.updateMany({
      where: { id: params.appointmentId, loyaltyStampedAt: { not: null } },
      data: { loyaltyStampedAt: null },
    });
    if (release.count === 0) return;
    // No baja de 0: si el sello ya se convirtió en premio, el cupón no se
    // revoca y la tarjeta simplemente no descuenta nada.
    await tx.loyaltyCard.updateMany({
      where: {
        businessId: params.businessId,
        clientId: params.clientId,
        stamps: { gt: 0 },
      },
      data: { stamps: { decrement: 1 }, totalStamps: { decrement: 1 } },
    });
  });
}

async function enqueueLoyaltyRewardNotification(
  businessId: string,
  clientId: string,
  reward: { code: string; percent: number; expiresAt: Date },
  now: Date,
): Promise<void> {
  try {
    const [business, client] = await Promise.all([
      prisma.business.findUnique({
        where: { id: businessId },
        select: {
          name: true,
          slug: true,
          timezone: true,
          notifyByEmail: true,
          notifyBySms: true,
          notifyByWhatsapp: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: clientId },
        select: { name: true, email: true, phone: true },
      }),
    ]);
    if (!business || !client) return;

    const expires = new Intl.DateTimeFormat("es-ES", {
      dateStyle: "long",
      timeZone: business.timezone,
    }).format(reward.expiresAt);
    const subject = `🎁 Premio de fidelidad en ${business.name}`;
    const body =
      `¡Enhorabuena ${client.name}! Has completado tu tarjeta de sellos en ` +
      `${business.name}.\n\nTu premio: un ${reward.percent}% de descuento en tu ` +
      `próxima cita con el cupón ${reward.code} (válido hasta el ${expires}, ` +
      `un solo uso).\n\nIntrodúcelo al reservar en el campo "Cupón".`;

    const deliveries: Array<{ channel: string; recipient: string }> = [];
    if (business.notifyByEmail && client.email) {
      deliveries.push({ channel: "EMAIL", recipient: client.email });
    }
    if (business.notifyBySms && client.phone) {
      deliveries.push({ channel: "SMS", recipient: client.phone });
    }
    if (business.notifyByWhatsapp && client.phone) {
      deliveries.push({ channel: "WHATSAPP", recipient: client.phone });
    }
    if (deliveries.length === 0) return;

    await prisma.notification.createMany({
      data: deliveries.map((d) => ({
        businessId,
        channel: d.channel,
        template: "LOYALTY_REWARD",
        recipient: d.recipient,
        subject,
        body,
        scheduledFor: now,
      })),
    });
  } catch (error) {
    logError("loyalty.notify.failed", error, { businessId, clientId });
  }
}

/** Progreso de las tarjetas de un cliente (para "Mis citas"). */
export async function getClientLoyaltyCards(clientId: string) {
  const cards = await prisma.loyaltyCard.findMany({
    where: {
      clientId,
      business: { active: true, loyaltyProgram: { is: { active: true } } },
    },
    include: {
      business: {
        select: {
          name: true,
          slug: true,
          loyaltyProgram: {
            select: { stampsRequired: true, rewardPercent: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  // Cupones de premio vigentes del cliente
  const coupons = await prisma.coupon.findMany({
    where: {
      clientId,
      active: true,
      code: { startsWith: LOYALTY_COUPON_PREFIX },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      timesRedeemed: 0,
    },
    select: {
      businessId: true,
      code: true,
      value: true,
      expiresAt: true,
    },
  });
  return { cards, coupons };
}
