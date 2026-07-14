import { prisma } from "@/lib/prisma";
import { emailChannel } from "./channels/email";
import { smsChannel } from "./channels/sms";
import { whatsappChannel } from "./channels/whatsapp";
import { webPushChannel } from "./channels/webpush";
import type { Channel } from "./channels/types";
import { isSentinelEmail } from "@/lib/domain/guest-clients";
import {
  bookingConfirmedMessage,
  cancellationMessage,
  noShowMessage,
  parseTemplateOverrides,
  reminderMessage,
  type AppointmentMessageContext,
  type TemplateOverrides,
} from "./templates";

const CHANNELS: Record<string, Channel> = {
  EMAIL: emailChannel,
  SMS: smsChannel,
  WHATSAPP: whatsappChannel,
  WEBPUSH: webPushChannel,
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60_000;
// Un envío reclamado (SENDING) que lleve más de este tiempo sin resolverse se
// considera huérfano (worker caído entre el claim y el resultado) y se devuelve
// a PENDING para reintentarlo. Debe superar con holgura el tiempo máximo de un
// lote de envíos.
const SENDING_STALE_MS = 10 * 60_000;
// Los envíos son I/O externo (SMTP, HTTP a los proveedores): se lanzan con esta
// concurrencia máxima aunque `PG_POOL_MAX=1`, porque no compiten por la única
// conexión de BD. Sube el techo de mensajes/ejecución ~10× respecto al envío
// secuencial sin tocar la arquitectura.
const SEND_CONCURRENCY = 10;

function baseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

type AppointmentForNotify = {
  id: string;
  startAt: Date;
  priceCents: number;
  confirmationToken: string;
  businessId: string;
  client: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    locale: string | null;
    pushSubscriptions: Array<{ id: string }>;
  };
  service: { name: string };
  staff: { name: string } | null;
  location: { name: string; address: string | null } | null;
  business: {
    name: string;
    timezone: string;
    currency: string;
    cancellationWindowHours: number;
    lateCancellationFeePercent: number;
    remindersEnabled: boolean;
    reminderHoursBefore: number;
    reminder2HoursBefore: number | null;
    notifyByEmail: boolean;
    notifyBySms: boolean;
    notifyByWhatsapp: boolean;
    notificationTemplates: string | null;
  };
};

async function loadAppointment(
  appointmentId: string,
): Promise<AppointmentForNotify | null> {
  return prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      startAt: true,
      priceCents: true,
      confirmationToken: true,
      businessId: true,
      client: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          locale: true,
          pushSubscriptions: { select: { id: true }, take: 1 },
        },
      },
      service: { select: { name: true } },
      staff: { select: { name: true } },
      location: { select: { name: true, address: true } },
      business: {
        select: {
          name: true,
          timezone: true,
          currency: true,
          cancellationWindowHours: true,
          lateCancellationFeePercent: true,
          remindersEnabled: true,
          reminderHoursBefore: true,
          reminder2HoursBefore: true,
          notifyByEmail: true,
          notifyBySms: true,
          notifyByWhatsapp: true,
          notificationTemplates: true,
        },
      },
    },
  });
}

function templateOverrides(a: AppointmentForNotify): TemplateOverrides {
  return parseTemplateOverrides(a.business.notificationTemplates);
}

function messageContext(a: AppointmentForNotify): AppointmentMessageContext {
  return {
    clientName: a.client.name,
    // Preferencia del cliente; sin ella, español (mercado por defecto)
    locale: a.client.locale === "en" ? ("en" as const) : ("es" as const),
    businessName: a.business.name,
    serviceName: a.service.name,
    staffName: a.staff?.name ?? null,
    locationName: a.location?.name ?? null,
    locationAddress: a.location?.address ?? null,
    startAt: a.startAt,
    timezone: a.business.timezone,
    currency: a.business.currency,
    priceCents: a.priceCents,
    cancellationWindowHours: a.business.cancellationWindowHours,
    lateCancellationFeePercent: a.business.lateCancellationFeePercent,
    confirmationUrl: `${baseUrl()}/c/${a.confirmationToken}`,
  };
}

// Canales activos del negocio para los que el cliente tiene contacto
function enabledDeliveries(
  a: AppointmentForNotify,
): Array<{ channel: string; recipient: string }> {
  const out: Array<{ channel: string; recipient: string }> = [];
  if (a.business.notifyByEmail && a.client.email) {
    out.push({ channel: "EMAIL", recipient: a.client.email });
  }
  if (a.business.notifyBySms && a.client.phone) {
    out.push({ channel: "SMS", recipient: a.client.phone });
  }
  if (a.business.notifyByWhatsapp && a.client.phone) {
    out.push({ channel: "WHATSAPP", recipient: a.client.phone });
  }
  // Push web: gratuito, sin toggle del negocio; basta que el cliente haya
  // activado los avisos en algún dispositivo. recipient = userId.
  if (a.client.pushSubscriptions.length > 0) {
    out.push({ channel: "WEBPUSH", recipient: a.client.id });
  }
  return out;
}

// Al reservar: confirmación inmediata + recordatorio programado con enlace
// de confirmación de asistencia.
export async function enqueueBookingNotifications(
  appointmentId: string,
  now = new Date(),
  // skipConfirmation: en una serie recurrente solo la primera ocurrencia envía
  // la confirmación inmediata (una por serie, no doce); los recordatorios de
  // cada ocurrencia se programan siempre.
  opts?: { skipConfirmation?: boolean },
): Promise<void> {
  const appointment = await loadAppointment(appointmentId);
  if (!appointment) return;

  const ctx = messageContext(appointment);
  const overrides = templateOverrides(appointment);
  const deliveries = enabledDeliveries(appointment);
  const rows: Array<{
    businessId: string;
    appointmentId: string;
    channel: string;
    template: string;
    recipient: string;
    subject: string;
    body: string;
    scheduledFor: Date;
  }> = [];

  if (!opts?.skipConfirmation) {
    const confirmed = bookingConfirmedMessage(ctx, overrides);
    for (const d of deliveries) {
      rows.push({
        businessId: appointment.businessId,
        appointmentId: appointment.id,
        channel: d.channel,
        template: "BOOKING_CONFIRMED",
        recipient: d.recipient,
        subject: confirmed.subject,
        body: confirmed.body,
        scheduledFor: now,
      });
    }
  }

  if (appointment.business.remindersEnabled) {
    // Recordatorio principal + segundo recordatorio opcional más cercano a
    // la cita (reminder2HoursBefore null = sin segundo aviso).
    const reminderOffsets = [appointment.business.reminderHoursBefore];
    if (typeof appointment.business.reminder2HoursBefore === "number") {
      reminderOffsets.push(appointment.business.reminder2HoursBefore);
    }

    const reminder = reminderMessage(ctx, overrides);
    const scheduledMinutes = new Set<number>();
    for (const hoursBefore of reminderOffsets) {
      const remindAt = new Date(
        appointment.startAt.getTime() - hoursBefore * 3_600_000,
      );
      // Solo se programa si queda margen real (una cita para dentro de una
      // hora no necesita recordatorio además de la confirmación)
      if (remindAt.getTime() <= now.getTime() + 5 * 60_000) continue;
      // Si ambos recordatorios caen en el mismo minuto, se encola solo uno
      const minute = Math.floor(remindAt.getTime() / 60_000);
      if (scheduledMinutes.has(minute)) continue;
      scheduledMinutes.add(minute);

      for (const d of deliveries) {
        rows.push({
          businessId: appointment.businessId,
          appointmentId: appointment.id,
          channel: d.channel,
          template: "REMINDER",
          recipient: d.recipient,
          subject: reminder.subject,
          body: reminder.body,
          scheduledFor: remindAt,
        });
      }
    }
  }

  if (rows.length > 0) {
    await prisma.notification.createMany({ data: rows });
  }
}

// Al cancelar: se anulan los envíos pendientes y se notifica la cancelación
// (con el cargo aplicado, si lo hubo).
export async function enqueueCancellationNotifications(
  appointmentId: string,
  chargedCents: number,
  now = new Date(),
): Promise<void> {
  await prisma.notification.updateMany({
    where: { appointmentId, status: "PENDING" },
    data: { status: "SKIPPED", lastError: "Cita cancelada" },
  });

  const appointment = await loadAppointment(appointmentId);
  if (!appointment) return;

  const message = cancellationMessage(
    messageContext(appointment),
    chargedCents,
    templateOverrides(appointment),
  );
  const rows = enabledDeliveries(appointment).map((d) => ({
    businessId: appointment.businessId,
    appointmentId: appointment.id,
    channel: d.channel,
    template: "CANCELLED",
    recipient: d.recipient,
    subject: message.subject,
    body: message.body,
    scheduledFor: now,
  }));
  if (rows.length > 0) {
    await prisma.notification.createMany({ data: rows });
  }
}

// Al marcar no-show: se anulan los recordatorios pendientes y se avisa al
// cliente de la ausencia y del cargo aplicado (si lo hubo).
export async function enqueueNoShowNotification(
  appointmentId: string,
  chargedCents: number,
  now = new Date(),
): Promise<void> {
  await prisma.notification.updateMany({
    where: { appointmentId, status: "PENDING" },
    data: { status: "SKIPPED", lastError: "No presentado" },
  });

  const appointment = await loadAppointment(appointmentId);
  if (!appointment) return;

  const message = noShowMessage(
    messageContext(appointment),
    chargedCents,
    templateOverrides(appointment),
  );
  const rows = enabledDeliveries(appointment).map((d) => ({
    businessId: appointment.businessId,
    appointmentId: appointment.id,
    channel: d.channel,
    template: "NO_SHOW",
    recipient: d.recipient,
    subject: message.subject,
    body: message.body,
    scheduledFor: now,
  }));
  if (rows.length > 0) {
    await prisma.notification.createMany({ data: rows });
  }
}

// Despacha los mensajes vencidos. Lo invoca el endpoint de cron o el worker.
//
// Seguridad ante concurrencia: si el cron de Vercel y el worker (o dos crons)
// coinciden, no deben enviar el mismo mensaje dos veces. Cada fila se reclama
// con un `updateMany` atómico PENDING→SENDING; solo el proceso cuya
// actualización afecta a la fila (`count === 1`) la procesa. Los envíos que
// queden en SENDING por un worker caído se recuperan a PENDING pasado
// SENDING_STALE_MS.
export async function processDueNotifications(
  now = new Date(),
  limit = 50,
): Promise<{ sent: number; failed: number; skipped: number }> {
  // Recupera envíos huérfanos de un intento anterior que no terminó.
  await prisma.notification.updateMany({
    where: {
      status: "SENDING",
      updatedAt: { lt: new Date(now.getTime() - SENDING_STALE_MS) },
    },
    data: { status: "PENDING" },
  });

  const due = await prisma.notification.findMany({
    where: { status: "PENDING", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  // El email sale con el nombre del negocio como remitente y su email como
  // Reply-To. Se cachea por negocio para no repetir la consulta en el lote.
  const senderCache = new Map<
    string,
    { fromName: string | null; replyTo: string | null }
  >();
  async function senderFor(businessId: string) {
    const cached = senderCache.get(businessId);
    if (cached) return cached;
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true, email: true },
    });
    const sender = {
      fromName: business?.name ?? null,
      replyTo: business?.email ?? null,
    };
    senderCache.set(businessId, sender);
    return sender;
  }

  // Fase 1 (secuencial, BD): reclama cada fila y resuelve en el acto lo que no
  // requiere I/O externo (centinela sin email, canal desconocido o no
  // configurado). Lo que sí necesita un envío real se acumula en `toSend`.
  type Deliverable = {
    n: (typeof due)[number];
    channel: Channel;
    options: { fromName: string | null; replyTo: string | null } | undefined;
  };
  const toSend: Deliverable[] = [];

  for (const n of due) {
    // Claim atómico: solo un proceso gana la transición PENDING→SENDING de esta
    // fila; el resto ve count 0 y la salta, evitando envíos duplicados.
    const claim = await prisma.notification.updateMany({
      where: { id: n.id, status: "PENDING" },
      data: { status: "SENDING" },
    });
    if (claim.count === 0) continue;

    // Walk-ins sin email real: dirección centinela → nunca se envía correo
    if (n.channel === "EMAIL" && isSentinelEmail(n.recipient)) {
      await prisma.notification.update({
        where: { id: n.id },
        data: { status: "SKIPPED", lastError: "Cliente sin email" },
      });
      skipped++;
      continue;
    }

    const channel = CHANNELS[n.channel];

    if (!channel) {
      await prisma.notification.update({
        where: { id: n.id },
        data: { status: "FAILED", lastError: `Canal desconocido: ${n.channel}` },
      });
      failed++;
      continue;
    }

    if (!channel.isConfigured()) {
      if (process.env.NODE_ENV !== "production") {
        // En desarrollo el mensaje se "envía" al log para poder probar el flujo
        console.log(
          `[notify:dev] ${n.channel} → ${n.recipient}\n${n.body}\n---`,
        );
        await prisma.notification.update({
          where: { id: n.id },
          data: { status: "SENT", sentAt: now, providerRef: "dev-log" },
        });
        sent++;
      } else {
        await prisma.notification.update({
          where: { id: n.id },
          data: { status: "SKIPPED", lastError: "Canal no configurado" },
        });
        skipped++;
      }
      continue;
    }

    const options =
      n.channel === "EMAIL" ? await senderFor(n.businessId) : undefined;
    toSend.push({ n, channel, options });
  }

  // Fase 2 (paralela, I/O): despacha los envíos reclamados con concurrencia
  // acotada. Un proveedor lento ya no bloquea al resto del lote.
  const results: Array<{
    n: (typeof due)[number];
    result: Awaited<ReturnType<Channel["send"]>>;
  }> = [];
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < toSend.length) {
      const item = toSend[cursor++];
      const result = await item.channel.send(
        item.n.recipient,
        item.n.subject,
        item.n.body,
        item.options,
      );
      results.push({ n: item.n, result });
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SEND_CONCURRENCY, toSend.length) }, worker),
  );

  // Fase 3 (secuencial, BD): persiste el desenlace de cada envío.
  for (const { n, result } of results) {
    if (result.ok) {
      await prisma.notification.update({
        where: { id: n.id },
        data: {
          status: "SENT",
          sentAt: now,
          providerRef: result.providerRef ?? null,
          attempts: n.attempts + 1,
        },
      });
      sent++;
    } else {
      const attempts = n.attempts + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      await prisma.notification.update({
        where: { id: n.id },
        data: {
          status: exhausted ? "FAILED" : "PENDING",
          attempts,
          lastError: result.error ?? "Error desconocido",
          // Backoff lineal sencillo entre reintentos
          scheduledFor: exhausted
            ? n.scheduledFor
            : new Date(now.getTime() + RETRY_DELAY_MS * attempts),
        },
      });
      failed++;
    }
  }

  return { sent, failed, skipped };
}

// Drenado inline best-effort para mensajes time-sensitive (confirmación de
// reserva recién creada, aviso de hueco libre de la lista de espera): saca los
// envíos vencidos en el acto en lugar de esperar al próximo ciclo del cron
// (hasta 5 min). NUNCA lanza: si falla o el runtime se congela tras responder,
// el cron sigue siendo la garantía de entrega.
export async function flushDueNotifications(
  now = new Date(),
  limit = 20,
): Promise<void> {
  try {
    await processDueNotifications(now, limit);
  } catch {
    // best-effort: el cron reintentará los que queden PENDING.
  }
}
