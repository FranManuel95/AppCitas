import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/domain/errors";
import { logError } from "@/lib/logger";
import { isValidDateISO, toLocalDateISO } from "@/lib/domain/dates";

// Lista de espera: cuando un cliente no encuentra hueco para un servicio en un
// día, se apunta; al cancelarse una cita de ese negocio+servicio+día se avisa a
// los que esperan para que reserven el hueco liberado.

const MAX_ACTIVE_PER_CLIENT = 20; // antiabuso: tope de entradas vivas por cliente
const ACTIVE_STATUSES = ["WAITING", "NOTIFIED"] as const;
// Cortesía tras avisar de un hueco antes de reciclar el aviso no aprovechado.
const NOTIFIED_RECYCLE_MS = 2 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

function baseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export interface JoinWaitlistParams {
  businessId: string;
  serviceId: string;
  clientId: string;
  desiredDate: string; // "YYYY-MM-DD" (zona del negocio)
  staffId?: string;
  // Preferencia opcional de sede (negocios multi-sede)
  locationId?: string;
  now?: Date;
}

/**
 * Apunta a un cliente a la lista de espera de un servicio para un día. Valida
 * aislamiento (servicio y empleado del negocio), que la fecha no sea pasada y
 * que no exista ya una entrada viva idéntica.
 */
export async function joinWaitlist(params: JoinWaitlistParams) {
  const { businessId, serviceId, clientId, desiredDate, staffId, locationId } =
    params;
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

  // Aislamiento: la sede (si se indica) debe ser del negocio.
  if (locationId) {
    const location = await prisma.location.findFirst({
      where: { id: locationId, businessId, active: true },
      select: { id: true },
    });
    if (!location) {
      throw new DomainError("Sede no encontrada", "LOCATION_NOT_FOUND", 404);
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
      locationId: locationId ?? null,
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
      locationId: locationId ?? null,
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

/**
 * Vista del NEGOCIO: entradas vivas (WAITING/NOTIFIED) de hoy en adelante,
 * ordenadas por día y servicio. Las de días ya pasados no se muestran (la
 * demanda caducó). Incluye contacto del cliente para que el negocio pueda
 * avisar manualmente si quiere.
 */
export async function getBusinessWaitlist(businessId: string, now = new Date()) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  });
  // Comparación lexicográfica de "YYYY-MM-DD" = cronológica.
  const todayISO = business
    ? toLocalDateISO(now, business.timezone)
    : "0000-00-00";

  return prisma.waitlistEntry.findMany({
    where: {
      businessId,
      status: { in: [...ACTIVE_STATUSES] },
      desiredDate: { gte: todayISO },
    },
    orderBy: [
      { desiredDate: "asc" },
      { serviceId: "asc" },
      { createdAt: "asc" },
    ],
    select: {
      id: true,
      desiredDate: true,
      status: true,
      notifiedAt: true,
      createdAt: true,
      service: { select: { id: true, name: true } },
      staff: { select: { name: true } },
      location: { select: { name: true } },
      client: { select: { name: true, email: true, phone: true } },
    },
  });
}

/**
 * El negocio elimina una entrada de SU lista de espera (aislamiento por
 * businessId: no puede tocar entradas de otro negocio).
 */
export async function adminRemoveWaitlistEntry(
  businessId: string,
  entryId: string,
) {
  const entry = await prisma.waitlistEntry.findFirst({
    where: { id: entryId, businessId },
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
      location: { select: { name: true } },
    },
  });
}

export interface FreedSlot {
  businessId: string;
  serviceId: string;
  staffId: string | null;
  // Sede del hueco liberado (null = sin sede: se avisa a todos)
  locationId?: string | null;
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
    // Sede: si el hueco liberado es de la sede X, se avisa a quien pidio X y
    // a quien no puso preferencia; un hueco sin sede avisa a todos.
    const locationFilter = slot.locationId
      ? { AND: [{ OR: [{ locationId: null }, { locationId: slot.locationId }] }] }
      : {};

    const entries = await prisma.waitlistEntry.findMany({
      where: {
        businessId: slot.businessId,
        serviceId: slot.serviceId,
        desiredDate: slot.desiredDate,
        status: "WAITING",
        ...staffFilter,
        ...locationFilter,
      },
      select: {
        id: true,
        client: { select: { email: true, phone: true, locale: true } },
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
        lastMinuteDiscountPercent: true,
      },
    });
    const service = await prisma.service.findUnique({
      where: { id: slot.serviceId },
      select: { name: true, priceCents: true },
    });
    if (!business || !service) return { notified: 0 };

    const url = `${baseUrl()}/b/${business.slug}/reservar?servicio=${slot.serviceId}`;
    // Gancho de última hora: si el negocio lo tiene activo, el aviso anuncia
    // el PRECIO exacto rebajado (el descuento se aplica solo al reservar una
    // cita que empieza en <24 h).
    const discountedCents =
      service.priceCents -
      Math.round(
        (service.priceCents * business.lastMinuteDiscountPercent) / 100,
      );
    // Texto en el idioma de cada cliente (es por defecto)
    const messageFor = (locale: string | null) => {
      if (locale === "en") {
        const note =
          business.lastMinuteDiscountPercent > 0
            ? ` Plus, appointments starting within 24 h get a ${business.lastMinuteDiscountPercent}% discount: "${service.name}" would be ${(discountedCents / 100).toFixed(2)} €.`
            : "";
        return {
          subject: `A slot just opened up at ${business.name}`,
          body: `Good news! A slot for "${service.name}" at ${business.name} on ${slot.desiredDate} just freed up. Book before it's gone: ${url}${note}`,
        };
      }
      const note =
        business.lastMinuteDiscountPercent > 0
          ? ` Además, si tu cita empieza en menos de 24 h se aplica solo un ${business.lastMinuteDiscountPercent}% de descuento: "${service.name}" te quedaría en ${(discountedCents / 100).toFixed(2).replace(".", ",")} €.`
          : "";
      return {
        subject: `Se ha liberado un hueco en ${business.name}`,
        body: `¡Buenas noticias! Se ha liberado un hueco para "${service.name}" en ${business.name} el ${slot.desiredDate}. Reserva antes de que lo cojan: ${url}${note}`,
      };
    };

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
      const message = messageFor(entry.client.locale);
      for (const d of deliveries) {
        rows.push({
          businessId: slot.businessId,
          channel: d.channel,
          template: "WAITLIST_SLOT_FREED",
          recipient: d.recipient,
          subject: message.subject,
          body: message.body,
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

/**
 * Al reservar, el cliente ya no espera ese servicio ese día: se borran sus
 * entradas vivas que coincidan. Evita que siga viéndose "en lista de espera"
 * tras reservar y que un reciclado le vuelva a avisar de algo que ya cubrió.
 * Mejor esfuerzo: nunca rompe la reserva.
 */
export async function fulfillWaitlistOnBooking(params: {
  clientId: string;
  businessId: string;
  serviceId: string;
  desiredDate: string;
}): Promise<void> {
  try {
    await prisma.waitlistEntry.deleteMany({
      where: {
        clientId: params.clientId,
        businessId: params.businessId,
        serviceId: params.serviceId,
        desiredDate: params.desiredDate,
        status: { in: [...ACTIVE_STATUSES] },
      },
    });
  } catch (error) {
    logError("waitlist.fulfill.failed", error, { clientId: params.clientId });
  }
}

/**
 * Borra las entradas de días ya pasados (WAITING o NOTIFIED). desiredDate es una
 * fecha local del negocio; se compara contra "ayer" en UTC para no borrar una
 * entrada que aún sea "hoy" en alguna zona horaria. Se invoca desde el cron.
 */
export async function expireStaleWaitlist(
  now = new Date(),
): Promise<{ expired: number }> {
  const cutoff = toLocalDateISO(new Date(now.getTime() - DAY_MS), "UTC");
  const res = await prisma.waitlistEntry.deleteMany({
    where: {
      desiredDate: { lt: cutoff },
      status: { in: [...ACTIVE_STATUSES] },
    },
  });
  return { expired: res.count };
}

/**
 * Recicla los avisos no aprovechados: una entrada NOTIFIED cuyo aviso se envió
 * hace más de NOTIFIED_RECYCLE_MS y cuyo día sigue en el futuro vuelve a
 * WAITING, para que la siguiente cancelación de ese día la vuelva a avisar. El
 * cooldown evita reavisos en cadena; fulfillWaitlistOnBooking garantiza que los
 * que ya reservaron no se reciclan. Se invoca desde el cron.
 */
export async function recycleNotifiedWaitlist(
  now = new Date(),
): Promise<{ recycled: number }> {
  const cooldownBefore = new Date(now.getTime() - NOTIFIED_RECYCLE_MS);
  const todayUTC = toLocalDateISO(now, "UTC");
  const res = await prisma.waitlistEntry.updateMany({
    where: {
      status: "NOTIFIED",
      notifiedAt: { lt: cooldownBefore },
      desiredDate: { gte: todayUTC },
    },
    data: { status: "WAITING", notifiedAt: null },
  });
  return { recycled: res.count };
}
