import { prisma } from "@/lib/prisma";
import { DomainError } from "./errors";
import { effectivePlan } from "./plans";
import { isSentinelEmail } from "./guest-clients";

// Campañas de marketing a la cartera de clientes del negocio, con segmentos
// calculados sobre su historial de citas. Los envíos van por el outbox de
// notificaciones (reintentos, marca del negocio en el email, etc.).
// Solo para el plan Pro: es la palanca clásica de monetización del sector.

export const CAMPAIGN_SEGMENTS = [
  "ALL",
  "NEW",
  "LOYAL",
  "INACTIVE",
  "BIRTHDAY",
] as const;
export type CampaignSegment = (typeof CAMPAIGN_SEGMENTS)[number];

export const CAMPAIGN_CHANNELS = ["EMAIL", "WHATSAPP", "SMS"] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

// Umbrales de los segmentos (días / nº de citas)
const NEW_DAYS = 30;
const INACTIVE_DAYS = 60;
const LOYAL_MIN_COMPLETED = 3;
const BIRTHDAY_WINDOW_DAYS = 30;

/**
 * ¿El próximo cumpleaños cae dentro de la ventana? Compara solo mes y día
 * (el año de nacimiento es irrelevante); si ya pasó este año, mira el que
 * viene. Pura para poder testearla con fechas fijas.
 */
export function isBirthdayUpcoming(
  birthDate: Date,
  now: Date,
  windowDays = BIRTHDAY_WINDOW_DAYS,
): boolean {
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      birthDate.getUTCMonth(),
      birthDate.getUTCDate(),
    ),
  );
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  if (next.getTime() < today) {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  }
  const days = Math.round((next.getTime() - today) / 86_400_000);
  return days >= 0 && days < windowDays;
}

interface Recipient {
  clientId: string;
  name: string;
  email: string;
  phone: string | null;
}

/**
 * Resuelve los clientes de un segmento. La "cartera" es quien tiene alguna
 * cita en el negocio; los umbrales se calculan sobre su historial:
 *  - NEW: su primera cita es de hace menos de 30 días.
 *  - LOYAL: 3 o más citas completadas.
 *  - INACTIVE: sin ninguna cita en los últimos 60 días (pero con historial).
 */
export async function resolveSegment(
  businessId: string,
  segment: CampaignSegment,
  now = new Date(),
): Promise<Recipient[]> {
  const grouped = await prisma.appointment.groupBy({
    by: ["clientId"],
    where: { businessId },
    _min: { startAt: true },
    _max: { startAt: true },
  });
  if (grouped.length === 0) return [];

  let clientIds = grouped.map((g) => g.clientId);

  if (segment === "NEW") {
    const cutoff = new Date(now.getTime() - NEW_DAYS * 86_400_000);
    clientIds = grouped
      .filter((g) => g._min.startAt && g._min.startAt >= cutoff)
      .map((g) => g.clientId);
  } else if (segment === "INACTIVE") {
    const cutoff = new Date(now.getTime() - INACTIVE_DAYS * 86_400_000);
    clientIds = grouped
      .filter((g) => g._max.startAt && g._max.startAt < cutoff)
      .map((g) => g.clientId);
  } else if (segment === "LOYAL") {
    const completed = await prisma.appointment.groupBy({
      by: ["clientId"],
      where: { businessId, status: "COMPLETED" },
      _count: { _all: true },
    });
    const loyal = new Set(
      completed
        .filter((c) => c._count._all >= LOYAL_MIN_COMPLETED)
        .map((c) => c.clientId),
    );
    clientIds = clientIds.filter((id) => loyal.has(id));
  }

  if (clientIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: {
      id: { in: clientIds },
      // BIRTHDAY: solo clientes que aportaron su fecha de nacimiento
      ...(segment === "BIRTHDAY" ? { birthDate: { not: null } } : {}),
    },
    select: { id: true, name: true, email: true, phone: true, birthDate: true },
  });
  return users
    .filter((u) => !isSentinelEmail(u.email))
    .filter(
      (u) =>
        segment !== "BIRTHDAY" ||
        (u.birthDate && isBirthdayUpcoming(u.birthDate, now)),
    )
    .map((u) => ({
      clientId: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
    }));
}

/** Conteo de destinatarios por segmento (para pintar el formulario). */
export async function getSegmentCounts(
  businessId: string,
  now = new Date(),
): Promise<Record<CampaignSegment, number>> {
  const [all, fresh, loyal, inactive, birthday] = await Promise.all([
    resolveSegment(businessId, "ALL", now),
    resolveSegment(businessId, "NEW", now),
    resolveSegment(businessId, "LOYAL", now),
    resolveSegment(businessId, "INACTIVE", now),
    resolveSegment(businessId, "BIRTHDAY", now),
  ]);
  return {
    ALL: all.length,
    NEW: fresh.length,
    LOYAL: loyal.length,
    INACTIVE: inactive.length,
    BIRTHDAY: birthday.length,
  };
}

/**
 * Crea la campaña y encola los envíos en el outbox. Devuelve la campaña con
 * el número real de destinatarios alcanzables por ese canal (email siempre;
 * WhatsApp/SMS solo clientes con teléfono).
 */
export async function sendCampaign(params: {
  businessId: string;
  segment: CampaignSegment;
  channel: CampaignChannel;
  subject?: string;
  body: string;
  now?: Date;
}) {
  const { businessId, segment, channel, subject, body } = params;
  const now = params.now ?? new Date();

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { plan: true, subscriptionStatus: true },
  });
  if (effectivePlan(business).id !== "pro") {
    throw new DomainError(
      "Las campañas de marketing requieren el plan Pro",
      "PLAN_LIMIT",
      402,
    );
  }
  if (channel === "EMAIL" && !subject?.trim()) {
    throw new DomainError(
      "El email necesita un asunto",
      "CAMPAIGN_SUBJECT_REQUIRED",
    );
  }

  const recipients = (await resolveSegment(businessId, segment, now)).filter(
    (r) => (channel === "EMAIL" ? !!r.email : !!r.phone),
  );

  const campaign = await prisma.$transaction(async (tx) => {
    const created = await tx.campaign.create({
      data: {
        businessId,
        segment,
        channel,
        subject: subject?.trim() || null,
        body: body.trim(),
        recipientCount: recipients.length,
      },
    });
    if (recipients.length > 0) {
      await tx.notification.createMany({
        data: recipients.map((r) => ({
          businessId,
          channel,
          template: "CAMPAIGN",
          recipient: channel === "EMAIL" ? r.email : r.phone!,
          subject: subject?.trim() || null,
          body: body.trim(),
          scheduledFor: now,
        })),
      });
    }
    return created;
  });

  return campaign;
}

export async function getBusinessCampaigns(businessId: string) {
  return prisma.campaign.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
