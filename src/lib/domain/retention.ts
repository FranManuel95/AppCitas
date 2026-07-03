import { prisma } from "@/lib/prisma";

// Retención de datos: los registros que solo sirven a corto plazo se purgan
// pasado su plazo para minimizar datos (RGPD art. 5.1.e). Se invoca desde el
// cron; como es oportunista, un fallo no debe tumbar el job.

const AUDIT_LOG_RETENTION_DAYS = 90;
// Los ids de webhook procesados solo evitan reprocesar reintentos de Stripe,
// que ocurren en horas/días; 90 días es un margen holgado.
const WEBHOOK_EVENT_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60_000;

export async function purgeExpiredData(
  now = new Date(),
): Promise<{ auditLogs: number; webhookEvents: number }> {
  let auditLogs = 0;
  let webhookEvents = 0;

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

  return { auditLogs, webhookEvents };
}
