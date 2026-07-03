import { prisma } from "@/lib/prisma";
import { emailChannel } from "./channels/email";
import { smsChannel } from "./channels/sms";
import { whatsappChannel } from "./channels/whatsapp";
import type { Channel } from "./channels/types";
import {
  bookingConfirmedMessage,
  cancellationMessage,
  reminderMessage,
  type AppointmentMessageContext,
} from "./templates";

const CHANNELS: Record<string, Channel> = {
  EMAIL: emailChannel,
  SMS: smsChannel,
  WHATSAPP: whatsappChannel,
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60_000;

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
  client: { name: string; email: string; phone: string | null };
  service: { name: string };
  staff: { name: string } | null;
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
      client: { select: { name: true, email: true, phone: true } },
      service: { select: { name: true } },
      staff: { select: { name: true } },
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
        },
      },
    },
  });
}

function messageContext(a: AppointmentForNotify): AppointmentMessageContext {
  return {
    clientName: a.client.name,
    businessName: a.business.name,
    serviceName: a.service.name,
    staffName: a.staff?.name ?? null,
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
  return out;
}

// Al reservar: confirmación inmediata + recordatorio programado con enlace
// de confirmación de asistencia.
export async function enqueueBookingNotifications(
  appointmentId: string,
  now = new Date(),
): Promise<void> {
  const appointment = await loadAppointment(appointmentId);
  if (!appointment) return;

  const ctx = messageContext(appointment);
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

  const confirmed = bookingConfirmedMessage(ctx);
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

  if (appointment.business.remindersEnabled) {
    // Recordatorio principal + segundo recordatorio opcional más cercano a
    // la cita (reminder2HoursBefore null = sin segundo aviso).
    const reminderOffsets = [appointment.business.reminderHoursBefore];
    if (typeof appointment.business.reminder2HoursBefore === "number") {
      reminderOffsets.push(appointment.business.reminder2HoursBefore);
    }

    const reminder = reminderMessage(ctx);
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

  const message = cancellationMessage(messageContext(appointment), chargedCents);
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

// Despacha los mensajes vencidos. Lo invoca el endpoint de cron o el worker.
export async function processDueNotifications(
  now = new Date(),
  limit = 50,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const due = await prisma.notification.findMany({
    where: { status: "PENDING", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const n of due) {
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

    const result = await channel.send(n.recipient, n.subject, n.body);
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
