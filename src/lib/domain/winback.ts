import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { isSentinelEmail } from "./guest-clients";
import { unsubscribeFooter } from "./campaigns";
import {
  parseTemplateOverrides,
  winbackMessage,
} from "@/lib/notifications/templates";

// Win-back automático: N días (Business.winbackDays) después de una cita
// COMPLETED sin cita posterior, se encola un aviso "vuelve a reservar".
// Idempotente por cita vía claim atómico de Appointment.winbackQueuedAt
// (patrón loyaltyStampedAt): la cita se marca tanto si genera aviso como si
// se descarta, así nunca se re-examina. Es un envío PROMOCIONAL: respeta
// marketingConsent y lleva pie de baja.

const BATCH_PER_BUSINESS = 50;
// Suelo de la ventana: al activar la función no se bombardea el histórico
// (solo citas cuya "fecha ideal de aviso" cayó en los últimos 14 días).
const WINDOW_FLOOR_DAYS = 14;
const DAY_MS = 86_400_000;

function baseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function processWinbacks(now = new Date()): Promise<number> {
  const businesses = await prisma.business.findMany({
    where: { winbackDays: { not: null }, active: true },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      currency: true,
      winbackDays: true,
      notifyByEmail: true,
      notifyBySms: true,
      notifyByWhatsapp: true,
      notificationTemplates: true,
      cancellationWindowHours: true,
      lateCancellationFeePercent: true,
    },
  });

  let queued = 0;
  for (const business of businesses) {
    try {
      queued += await processBusiness(business, now);
    } catch (error) {
      logError("winback.failed", error, { businessId: business.id });
    }
  }
  return queued;
}

interface WinbackBusiness {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  winbackDays: number | null;
  notifyByEmail: boolean;
  notifyBySms: boolean;
  notifyByWhatsapp: boolean;
  notificationTemplates: string | null;
  cancellationWindowHours: number;
  lateCancellationFeePercent: number;
}

async function processBusiness(
  business: WinbackBusiness,
  now: Date,
): Promise<number> {
  const days = business.winbackDays!;
  const windowEnd = new Date(now.getTime() - days * DAY_MS);
  const windowStart = new Date(
    now.getTime() - (days + WINDOW_FLOOR_DAYS) * DAY_MS,
  );

  // Usa el índice Appointment(status, endAt) (+ filtro por negocio)
  const candidates = await prisma.appointment.findMany({
    where: {
      businessId: business.id,
      status: "COMPLETED",
      winbackQueuedAt: null,
      endAt: { gte: windowStart, lt: windowEnd },
    },
    select: {
      id: true,
      startAt: true,
      priceCents: true,
      service: { select: { name: true } },
      client: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          marketingConsent: true,
        },
      },
    },
    orderBy: { endAt: "asc" },
    take: BATCH_PER_BUSINESS,
  });

  const overrides = parseTemplateOverrides(business.notificationTemplates);
  let queued = 0;

  for (const candidate of candidates) {
    // Claim atómico: solo un proceso trabaja (y marca) cada cita, y la marca
    // aunque se descarte — así no se re-examina en cada pasada del cron.
    const claim = await prisma.appointment.updateMany({
      where: { id: candidate.id, winbackQueuedAt: null },
      data: { winbackQueuedAt: now },
    });
    if (claim.count === 0) continue;

    if (!candidate.client.marketingConsent) continue;

    // ¿El cliente ya tiene una cita posterior en este negocio? Entonces no
    // hay nada que recuperar. (Índice [clientId, startAt].)
    const later = await prisma.appointment.findFirst({
      where: {
        businessId: business.id,
        clientId: candidate.client.id,
        startAt: { gt: candidate.startAt },
        status: { in: ["CONFIRMED", "COMPLETED"] },
      },
      select: { id: true },
    });
    if (later) continue;

    const message = winbackMessage(
      {
        clientName: candidate.client.name,
        businessName: business.name,
        serviceName: candidate.service.name,
        startAt: candidate.startAt,
        timezone: business.timezone,
        currency: business.currency,
        priceCents: candidate.priceCents,
        cancellationWindowHours: business.cancellationWindowHours,
        lateCancellationFeePercent: business.lateCancellationFeePercent,
        confirmationUrl: `${baseUrl()}/b/${business.slug}/reservar`,
      },
      overrides,
    );
    const body = `${message.body}${unsubscribeFooter(candidate.client.id)}`;

    const deliveries: Array<{ channel: string; recipient: string }> = [];
    if (
      business.notifyByEmail &&
      candidate.client.email &&
      !isSentinelEmail(candidate.client.email)
    ) {
      deliveries.push({ channel: "EMAIL", recipient: candidate.client.email });
    }
    if (business.notifyBySms && candidate.client.phone) {
      deliveries.push({ channel: "SMS", recipient: candidate.client.phone });
    }
    if (business.notifyByWhatsapp && candidate.client.phone) {
      deliveries.push({
        channel: "WHATSAPP",
        recipient: candidate.client.phone,
      });
    }
    if (deliveries.length === 0) continue;

    await prisma.notification.createMany({
      data: deliveries.map((d) => ({
        businessId: business.id,
        appointmentId: candidate.id,
        channel: d.channel,
        template: "WINBACK",
        recipient: d.recipient,
        subject: message.subject,
        body,
        scheduledFor: now,
      })),
    });
    queued++;
  }
  return queued;
}
