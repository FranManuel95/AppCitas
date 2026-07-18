import "dotenv/config";
import { runScheduledJobs } from "../src/lib/jobs";
import { logError } from "../src/lib/logger";

// Worker local (VPS/Docker): ejecuta en bucle LAS MISMAS tareas programadas
// que el endpoint serverless (src/lib/jobs.ts) — notificaciones, autocierre,
// facturas pendientes, membresías, sincronización de Google Calendar, purgas…
// En despliegues serverless usa en su lugar un cron que llame a
// POST /api/jobs/notifications cada pocos minutos.
const INTERVAL_MS = 30_000;

async function tick() {
  try {
    const r = await runScheduledJobs(new Date(), { timeBudgetMs: 25_000 });
    const purged =
      r.purged.auditLogs + r.purged.webhookEvents + r.purged.notifications +
      r.purged.calendarSyncJobs;
    const activity =
      r.sent + r.failed + r.skipped + r.autoClosed + r.invoicesIssued +
      r.membershipsRenewed + r.membershipsEnded + r.calendarEventsSynced +
      r.waitlistExpired + r.waitlistRecycled + r.winbacksQueued +
      r.watchChannelsRenewed + r.trialsDegraded + purged;
    if (activity > 0) {
      console.log(
        `[worker] enviados=${r.sent} fallidos=${r.failed} omitidos=${r.skipped} ` +
          `autocerradas=${r.autoClosed} facturas=${r.invoicesIssued} ` +
          `membresias=${r.membershipsRenewed + r.membershipsEnded} ` +
          `calendario=${r.calendarEventsSynced} espera=${r.waitlistExpired + r.waitlistRecycled} ` +
          `winback=${r.winbacksQueued} watch=${r.watchChannelsRenewed} ` +
          `pruebas=${r.trialsDegraded} purgados=${purged}`,
      );
    }
  } catch (error) {
    logError("worker.tick", error);
  }
}

console.log("[worker] tareas programadas cada 30s (Ctrl+C para salir)");
void tick();
setInterval(tick, INTERVAL_MS);
