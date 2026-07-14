import { prisma } from "@/lib/prisma";
import { DomainError } from "./errors";
import { effectivePlan } from "./plans";
import { isSentinelEmail } from "./guest-clients";
import { unsubscribeToken } from "@/lib/marketing-token";

function baseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Pie de baja obligatorio de todo envío promocional (LSSI: opt-out fácil). */
export function unsubscribeFooter(clientId: string): string {
  return `\n\nPara dejar de recibir promociones: ${baseUrl()}/baja/${unsubscribeToken(clientId)}`;
}

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

  let clientIds = grouped.map((g) => g.clientId);

  // La cartera también incluye a los clientes SIN citas pero con notas del
  // negocio (importados de CSV): cuentan en ALL y BIRTHDAY. Los segmentos de
  // comportamiento (NEW/LOYAL/INACTIVE) exigen historial de citas.
  if (segment === "ALL" || segment === "BIRTHDAY") {
    const noted = await prisma.clientNote.findMany({
      where: { businessId },
      select: { clientId: true },
      distinct: ["clientId"],
    });
    const seen = new Set(clientIds);
    for (const { clientId } of noted) {
      if (!seen.has(clientId)) clientIds.push(clientId);
    }
  }
  if (clientIds.length === 0) return [];

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
      // Solo destinatarios con consentimiento comercial vigente (opt-out)
      marketingConsent: true,
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

/**
 * Conteo de destinatarios por segmento (para pintar el formulario). Replica
 * las reglas de resolveSegment en UNA pasada (4 consultas en vez de ~13):
 * con el pool de una conexión de producción, cada consulta ahorrada cuenta.
 * El envío real sigue usando resolveSegment.
 */
export async function getSegmentCounts(
  businessId: string,
  now = new Date(),
): Promise<Record<CampaignSegment, number>> {
  const [grouped, noted, completed] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["clientId"],
      where: { businessId },
      _min: { startAt: true },
      _max: { startAt: true },
    }),
    prisma.clientNote.findMany({
      where: { businessId },
      select: { clientId: true },
      distinct: ["clientId"],
    }),
    prisma.appointment.groupBy({
      by: ["clientId"],
      where: { businessId, status: "COMPLETED" },
      _count: { _all: true },
    }),
  ]);

  const counts: Record<CampaignSegment, number> = {
    ALL: 0,
    NEW: 0,
    LOYAL: 0,
    INACTIVE: 0,
    BIRTHDAY: 0,
  };

  // Cartera: clientes con citas + fichados solo con nota (estos últimos
  // cuentan únicamente en ALL y BIRTHDAY, como en resolveSegment).
  const portfolio = new Set(grouped.map((g) => g.clientId));
  for (const { clientId } of noted) portfolio.add(clientId);
  if (portfolio.size === 0) return counts;

  const users = await prisma.user.findMany({
    where: { id: { in: [...portfolio] } },
    select: { id: true, email: true, birthDate: true, marketingConsent: true },
  });
  // Mismas reglas que resolveSegment: sentinel fuera y sin consentimiento fuera
  const reachable = new Set(
    users
      .filter((u) => u.marketingConsent && !isSentinelEmail(u.email))
      .map((u) => u.id),
  );
  const birthdayIds = new Set(
    users
      .filter(
        (u) =>
          u.marketingConsent &&
          !isSentinelEmail(u.email) &&
          u.birthDate &&
          isBirthdayUpcoming(u.birthDate, now),
      )
      .map((u) => u.id),
  );

  for (const id of portfolio) {
    if (reachable.has(id)) counts.ALL++;
    if (birthdayIds.has(id)) counts.BIRTHDAY++;
  }

  const newCutoff = new Date(now.getTime() - NEW_DAYS * 86_400_000);
  const inactiveCutoff = new Date(now.getTime() - INACTIVE_DAYS * 86_400_000);
  const loyalIds = new Set(
    completed
      .filter((c) => c._count._all >= LOYAL_MIN_COMPLETED)
      .map((c) => c.clientId),
  );
  for (const g of grouped) {
    if (!reachable.has(g.clientId)) continue;
    if (g._min.startAt && g._min.startAt >= newCutoff) counts.NEW++;
    if (g._max.startAt && g._max.startAt < inactiveCutoff) counts.INACTIVE++;
    if (loyalIds.has(g.clientId)) counts.LOYAL++;
  }
  return counts;
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
          // Pie de baja personalizado por destinatario (opt-out de un clic)
          body: `${body.trim()}${unsubscribeFooter(r.clientId)}`,
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
