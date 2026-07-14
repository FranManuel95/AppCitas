import { processDueNotifications } from "@/lib/notifications/service";
import { closePastAppointments } from "@/lib/domain/auto-close";
import { cleanupRateLimitCounters } from "@/lib/rate-limit";
import { degradeExpiredTrials } from "@/lib/domain/plans";
import { purgeExpiredData } from "@/lib/domain/retention";
import { issuePendingInvoices } from "@/lib/domain/invoices";
import { renewSimulatedMemberships } from "@/lib/payments/memberships";
import { processCalendarSyncJobs } from "@/lib/calendar/sync";
import { purgeBusyCache } from "@/lib/calendar/freebusy";
import { renewExpiringWatchChannels } from "@/lib/calendar/watch";
import { processWinbacks } from "@/lib/domain/winback";
import {
  expireStaleWaitlist,
  recycleNotifiedWaitlist,
} from "@/lib/domain/waitlist";
import { recordJobRun } from "@/lib/domain/platform-health";

// Tareas programadas de la plataforma, en UN solo sitio: las ejecutan tanto
// el endpoint de cron (/api/jobs/notifications, serverless) como el worker
// local de VPS (scripts/worker.ts). Añadir aquí cualquier job nuevo para que
// ningún despliegue se quede sin él.

const NOTIFICATION_BATCH = 50;
const MAX_DRAIN_ITERATIONS = 10;

export interface ScheduledJobsResult {
  sent: number;
  failed: number;
  skipped: number;
  autoClosed: number;
  trialsDegraded: number;
  purged: { auditLogs: number; webhookEvents: number };
  waitlistExpired: number;
  waitlistRecycled: number;
  invoicesIssued: number;
  membershipsRenewed: number;
  membershipsEnded: number;
  calendarEventsSynced: number;
  watchChannelsRenewed: number;
  winbacksQueued: number;
}

/**
 * Ejecuta todas las tareas programadas. El outbox de notificaciones se DRENA
 * (repite lotes de 50 mientras vengan llenos) con dos topes: `timeBudgetMs`
 * para no rebasar el límite de la plataforma y un máximo de iteraciones como
 * red de seguridad. Con el cron cada 5 min, esto elimina el techo efectivo de
 * 50 mensajes por ejecución que tenía la versión anterior.
 */
export async function runScheduledJobs(
  now = new Date(),
  opts?: { timeBudgetMs?: number },
): Promise<ScheduledJobsResult> {
  const timeBudgetMs = opts?.timeBudgetMs ?? 45_000;
  const startedAt = Date.now();

  // Drenaje del outbox de notificaciones
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (let i = 0; i < MAX_DRAIN_ITERATIONS; i++) {
    const batch = await processDueNotifications(now, NOTIFICATION_BATCH);
    sent += batch.sent;
    failed += batch.failed;
    skipped += batch.skipped;
    const processed = batch.sent + batch.failed + batch.skipped;
    if (processed < NOTIFICATION_BATCH) break; // cola vacía (lote no lleno)
    if (Date.now() - startedAt > timeBudgetMs) break; // presupuesto agotado
  }

  // Cierre automático de citas pasadas (negocios con autoCompleteEnabled)
  const { closed: autoClosed } = await closePastAppointments();
  // Degradar pruebas caducadas sin suscripción a plan free
  const { degraded: trialsDegraded } = await degradeExpiredTrials();
  // Mantenimiento oportunista: purga ventanas viejas del rate limiting.
  await cleanupRateLimitCounters();
  // Retención: purga logs de auditoría y eventos de webhook caducados (>90 d).
  const purged = await purgeExpiredData();
  // Lista de espera: borra las entradas de días pasados y recicla los avisos
  // no aprovechados para que la siguiente cancelación vuelva a avisar.
  const { expired: waitlistExpired } = await expireStaleWaitlist();
  const { recycled: waitlistRecycled } = await recycleNotifiedWaitlist();
  // Facturación: reconcilia cobros recientes que quedaron sin factura
  // (p. ej. la app cayó entre el cobro y la emisión).
  const invoicesIssued = await issuePendingInvoices();
  // Membresías simuladas (dev): renueva las vencidas o cierra las canceladas.
  const memberships = await renewSimulatedMemberships();
  // Google Calendar: reintenta los eventos pendientes y purga la caché vieja.
  const calendarSync = await processCalendarSyncJobs(now);
  await purgeBusyCache(now);
  // Watch channels: renueva los que caducan en <24 h (y crea los que falten).
  const watchChannelsRenewed = await renewExpiringWatchChannels(now);
  // Win-back: "vuelve a reservar" para clientes sin cita posterior.
  const winbacksQueued = await processWinbacks(now);

  const result: ScheduledJobsResult = {
    sent,
    failed,
    skipped,
    autoClosed,
    trialsDegraded,
    purged,
    waitlistExpired,
    waitlistRecycled,
    invoicesIssued,
    membershipsRenewed: memberships.renewed,
    membershipsEnded: memberships.ended,
    calendarEventsSynced: calendarSync.sent,
    watchChannelsRenewed,
    winbacksQueued,
  };

  // Sella la ejecución para la sonda /api/health (best-effort).
  await recordJobRun(result, now);

  return result;
}
