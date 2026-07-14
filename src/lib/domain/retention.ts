import { prisma } from "@/lib/prisma";

// Retención de datos: los registros que solo sirven a corto plazo se purgan
// pasado su plazo para minimizar datos (RGPD art. 5.1.e). Se invoca desde el
// cron; como es oportunista, un fallo no debe tumbar el job.

const AUDIT_LOG_RETENTION_DAYS = 90;
// Los ids de webhook procesados solo evitan reprocesar reintentos de Stripe,
// que ocurren en horas/días; 90 días es un margen holgado.
const WEBHOOK_EVENT_RETENTION_DAYS = 90;
// Outbox: lo entregado se purga a los 90 días; lo fallido se conserva el
// doble para diagnóstico. PENDING/SENDING no se tocan jamás.
const OUTBOX_SENT_RETENTION_DAYS = 90;
const OUTBOX_FAILED_RETENTION_DAYS = 180;

const DAY_MS = 24 * 60 * 60_000;

export async function purgeExpiredData(
  now = new Date(),
): Promise<{
  auditLogs: number;
  webhookEvents: number;
  notifications: number;
  calendarSyncJobs: number;
}> {
  let auditLogs = 0;
  let webhookEvents = 0;
  let notifications = 0;
  let calendarSyncJobs = 0;

  try {
    const cutoff = new Date(now.getTime() - AUDIT_LOG_RETENTION_DAYS * DAY_MS);
    const res = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    auditLogs = res.count;
  } catch {
    // Purga oportunista: no rompe el cron si falla.
  }

  try {
    const cutoff = new Date(now.getTime() - WEBHOOK_EVENT_RETENTION_DAYS * DAY_MS);
    const res = await prisma.processedWebhookEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    webhookEvents = res.count;
  } catch {
    // idem.
  }

  // Notificaciones ya resueltas: sin purga crecen sin cota (las de campaña ni
  // siquiera caen en cascada al borrar citas, appointmentId null).
  try {
    const sentCutoff = new Date(now.getTime() - OUTBOX_SENT_RETENTION_DAYS * DAY_MS);
    const failedCutoff = new Date(now.getTime() - OUTBOX_FAILED_RETENTION_DAYS * DAY_MS);
    const res = await prisma.notification.deleteMany({
      where: {
        OR: [
          { status: { in: ["SENT", "SKIPPED"] }, createdAt: { lt: sentCutoff } },
          { status: "FAILED", createdAt: { lt: failedCutoff } },
        ],
      },
    });
    notifications = res.count;
  } catch {
    // idem.
  }

  try {
    const sentCutoff = new Date(now.getTime() - OUTBOX_SENT_RETENTION_DAYS * DAY_MS);
    const failedCutoff = new Date(now.getTime() - OUTBOX_FAILED_RETENTION_DAYS * DAY_MS);
    const res = await prisma.calendarSyncJob.deleteMany({
      where: {
        OR: [
          { status: "SENT", createdAt: { lt: sentCutoff } },
          { status: "FAILED", createdAt: { lt: failedCutoff } },
        ],
      },
    });
    calendarSyncJobs = res.count;
  } catch {
    // idem.
  }

  return { auditLogs, webhookEvents, notifications, calendarSyncJobs };
}
