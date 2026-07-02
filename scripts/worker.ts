import "dotenv/config";
import { processDueNotifications } from "../src/lib/notifications/service";

// Worker local: despacha el outbox de notificaciones en bucle.
// Para despliegues serverless usa en su lugar un cron que llame a
// POST /api/jobs/notifications cada minuto.
const INTERVAL_MS = 30_000;

async function tick() {
  try {
    const { sent, failed, skipped } = await processDueNotifications();
    if (sent || failed || skipped) {
      console.log(
        `[worker] enviados=${sent} fallidos=${failed} omitidos=${skipped}`,
      );
    }
  } catch (error) {
    console.error("[worker] error:", error);
  }
}

console.log("[worker] procesando notificaciones cada 30s (Ctrl+C para salir)");
void tick();
setInterval(tick, INTERVAL_MS);
