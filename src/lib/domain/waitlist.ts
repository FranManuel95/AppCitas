import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/domain/errors";
import { logError } from "@/lib/logger";
import { isValidDateISO, toLocalDateISO } from "@/lib/domain/dates";

// Lista de espera: cuando un cliente no encuentra hueco para un servicio en un
// día, se apunta; al cancelarse una cita de ese negocio+servicio+día se avisa a
// los que esperan para que reserven el hueco liberado.

const MAX_ACTIVE_PER_CLIENT = 20; // antiabuso: tope de entradas vivas por cliente
const ACTIVE_STATUSES = ["WAITING", "NOTIFIED"] as const;

function baseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export interface JoinWaitlistParams {
  businessId: string;
  serviceId: string;
  clientId: string;
  desiredDate: string; // "YYYY-MM-DD" (zona del negocio)
  staffId?: string;
  now?: Date;
}

/**
 * Apunta a un cliente a la lista de espera de un servicio para un día. Valida
 * aislamiento (servicio y empleado del negocio), que la fecha no sea pasada y
 * que no exista ya una entrada viva idéntica.
 */
export async function joinWaitlist(params: JoinWaitlistParams) {
  const { businessId, serviceId, clientId, desiredDate, staffId } = params;
  const now = params.now ?? new Date();

  if (!isValidDateISO(desiredDate)) {
    throw new DomainError("Fecha inválida", "INVALID_DATE", 400);
  }

  const business = await prisma.business.findFirst({
    where: { id: businessId, active: true },
    select: { id: true, timezone: true },
  });
  if (!business) {
    throw new DomainError("Negocio no encontrado", "BUSINESS_NOT_FOUND", 404);
  }

  // No se admiten días pasados (en la zona del negocio).
  const todayISO = toLocalDateISO(now, business.timezone);
  if (desiredDate < todayISO) {
    throw new DomainError(
      "No puedes apuntarte a un día pasado",
      "DATE_IN_PAST",
      422,
    );
  }

  // Aislamiento: el servicio debe ser del negocio.
  const service = await prisma.service.findFirst({
    where: { id: serviceId, businessId, active: true },
    select: { id: true },
  });
  if (!service) {
    throw new DomainError("Servicio no encontrado", "SERVICE_NOT_FOUND", 404);
  }

  // Aislamiento: el empleado (si se indica) debe ser del negocio.
  if (staffId) {
    const staff = await prisma.staffMember.findFirst({
      where: { id: staffId, businessId, active: true },
      select: { id: true },
    });
    if (!staff) {
      throw new DomainError("Empleado no encontrado", "STAFF_NOT_FOUND", 404);
    }
  }

  const activeCount = await prisma.waitlistEntry.count({
    where: { clientId, status: { in: [...ACTIVE_STATUSES] } },
  });
  if (activeCount >= MAX_ACTIVE_PER_CLIENT) {
    throw new DomainError(
      `Ya tienes ${MAX_ACTIVE_PER_CLIENT} avisos de lista de espera activos`,
      "WAITLIST_LIMIT",
      422,
    );
  }

  // Evitar duplicados vivos del mismo cliente/servicio/día/empleado.
  const existing = await prisma.waitlistEntry.findFirst({
    where: {
      clientId,
      businessId,
      serviceId,
      desiredDate,
      staffId: staffId ?? null,
      status: { in: [...ACTIVE_STATUSES] },
    },
    select: { id: true },
  });
  if (existing) {
    throw new DomainError(
      "Ya estás en la lista de espera para ese día",
      "WAITLIST_DUPLICATE",
      409,
    );
  }

  return prisma.waitlistEntry.create({
    data: {
      businessId,
      serviceId,
      clientId,
      staffId: staffId ?? null,
      desiredDate,
      status: "WAITING",
    },
  });
}

/** El cliente se borra de una entrada suya (idempotente si ya no existe/ajena). */
export async function leaveWaitlist(entryId: string, clientId: string) {
  const entry = await prisma.waitlistEntry.findFirst({
    where: { id: entryId, clientId },
    select: { id: true },
  });
  if (!entry) {
    throw new DomainError(
      "Entrada de lista de espera no encontrada",
      "WAITLIST_NOT_FOUND",
      404,
    );
  }
  await prisma.waitlistEntry.delete({ where: { id: entryId } });
  return { deleted: true };
}

/** Entradas vivas de un cliente, con nombres de negocio/servicio para la UI. */
export async function listClientWaitlist(clientId: string) {
  return prisma.waitlistEntry.findMany({
    where: { clientId, status: { in: [...ACTIVE_STATUSES] } },
    orderBy: [{ desiredDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      desiredDate: true,
      status: true,
      notifiedAt: true,
      business: { select: { name: true, slug: true } },
      service: { select: { id: true, name: true } },
      staff: { select: { name: true } },
    },
  });
}

export interface FreedSlot {
  businessId: string;
  serviceId: string;
  staffId: string | null;
  desiredDate: string; // "YYYY-MM-DD" (zona del negocio)
  now?: Date;
}

/**
 * Al liberarse un hueco (cancelación), avisa a los que esperan ese
 * negocio+servicio+día. Si el hueco liberado es de un profesional concreto,
 * incluye a quien no puso preferencia y a quien pidió ese profesional; si es
 * genérico (sin empleado), solo a quien no puso preferencia. Encola una
 * notificación por los canales activos del negocio y marca la entrada NOTIFIED
 * (no se vuelve a avisar). Mejor esfuerzo: nunca lanza.
 */
export async function notifyWaitlistForFreedSlot(
  slot: FreedSlot,
): Promise<{ notified: number }> {
  const now = slot.now ?? new Date();
  try {
    const staffFilter = slot.staffId
      ? { OR: [{ staffId: null }, { staffId: slot.staffId }] }
      : { staffId: null };

    const entries = await prisma.waitlistEntry.findMany({
      where: {
        businessId: slot.businessId,
        serviceId: slot.serviceId,
        desiredDate: slot.desiredDate,
        status: "WAITING",
        ...staffFilter,
      },
      select: {
        id: true,
        client: { select: { email: true, phone: true } },
      },
    });
    if (entries.length === 0) return { notified: 0 };

    const business = await prisma.business.findUnique({
      where: { id: slot.businessId },
      select: {
        name: true,
        slug: true,
        notifyByEmail: true,
        notifyBySms: true,
        notifyByWhatsapp: true,
      },
    });
    const service = await prisma.service.findUnique({
      where: { id: slot.serviceId },
      select: { name: true },
    });
    if (!business || !service) return { notified: 0 };

    const url = `${baseUrl()}/b/${business.slug}/reservar?servicio=${slot.serviceId}`;
    const subject = `Se ha liberado un hueco en ${business.name}`;
    const body = `¡Buenas noticias! Se ha liberado un hueco para "${service.name}" en ${business.name} el ${slot.desiredDate}. Reserva antes de que lo cojan: ${url}`;

    const rows: Array<{
      businessId: string;
      channel: string;
      template: string;
      recipient: string;
      subject: string;
      body: string;
      scheduledFor: Date;
    }> = [];
    const notifiedIds: string[] = [];

    for (const entry of entries) {
      const deliveries: Array<{ channel: string; recipient: string }> = [];
      if (business.notifyByEmail && entry.client.email) {
        deliveries.push({ channel: "EMAIL", recipient: entry.client.email });
      }
      if (business.notifyBySms && entry.client.phone) {
        deliveries.push({ channel: "SMS", recipient: entry.client.phone });
      }
      if (business.notifyByWhatsapp && entry.client.phone) {
        deliveries.push({ channel: "WHATSAPP", recipient: entry.client.phone });
      }
      for (const d of deliveries) {
        rows.push({
          businessId: slot.businessId,
          channel: d.channel,
          template: "WAITLIST_SLOT_FREED",
          recipient: d.recipient,
          subject,
          body,
          scheduledFor: now,
        });
      }
      // Se marca NOTIFIED aunque no haya canal (evita reintentos infinitos).
      notifiedIds.push(entry.id);
    }

    await prisma.$transaction([
      ...(rows.length > 0
        ? [prisma.notification.createMany({ data: rows })]
        : []),
      prisma.waitlistEntry.updateMany({
        where: { id: { in: notifiedIds } },
        data: { status: "NOTIFIED", notifiedAt: now },
      }),
    ]);

    return { notified: notifiedIds.length };
  } catch (error) {
    // La lista de espera es un extra: su fallo no debe romper la cancelación.
    logError("waitlist.notify.failed", error, {
      businessId: slot.businessId,
      serviceId: slot.serviceId,
      desiredDate: slot.desiredDate,
    });
    return { notified: 0 };
  }
}
