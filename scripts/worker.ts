import "dotenv/config";
import { processDueNotifications } from "../src/lib/notifications/service";
import { closePastAppointments } from "../src/lib/domain/auto-close";
import { logError } from "../src/lib/logger";

// Worker local: despacha el outbox de notificaciones y cierra citas pasadas
// en bucle. Para despliegues serverless usa en su lugar un cron que llame a
// POST /api/jobs/notifications cada minuto.
const INTERVAL_MS = 30_000;

async function tick() {
  try {
    const { sent, failed, skipped } = await processDueNotifications();
    const { closed } = await closePastAppointments();
    if (sent || failed || skipped || closed) {
      console.log(
        `[worker] enviados=${sent} fallidos=${failed} omitidos=${skipped} autocerradas=${closed}`,
      );
    }
  } catch (error) {
    logError("worker.tick", error);
  }
}

console.log("[worker] procesando notificaciones cada 30s (Ctrl+C para salir)");
void tick();
setInterval(tick, INTERVAL_MS);
