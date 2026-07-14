import { prisma } from "@/lib/prisma";

// Telemetría operativa de la plataforma. El cron (runScheduledJobs) sella cada
// ejecución en PlatformSetting; la sonda /api/health la lee para que un monitor
// de uptime externo (cron-job.org, BetterStack) detecte que el cron dejó de
// dispararse — alertar activamente desde dentro de serverless es frágil, así
// que exponemos el estado y dejamos que un tercero vigile.

const SETTINGS_ID = "platform";
// Con el cron cada 5 min, más de 15 min sin ejecutarse es señal de que algo va
// mal (GitHub Actions retrasado o caído).
const STALE_AFTER_SECONDS = 15 * 60;

export interface PlatformHealth {
  cron: { lastRunAt: string | null; ageSeconds: number | null; stale: boolean };
  outbox: { pendingOverdue: number };
}

// Sella el resultado de la última ejecución del cron. Best-effort: la telemetría
// nunca debe tumbar el propio cron.
export async function recordJobRun(
  result: unknown,
  now = new Date(),
): Promise<void> {
  try {
    const serialized = JSON.stringify(result);
    await prisma.platformSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, lastJobRunAt: now, lastJobRunResult: serialized },
      update: { lastJobRunAt: now, lastJobRunResult: serialized },
    });
  } catch {
    // best-effort.
  }
}

// Estado de salud operativa: antigüedad de la última ejecución del cron y
// tamaño del backlog de notificaciones vencidas sin enviar. Si el cron nunca
// corrió (despliegue recién hecho), lastRunAt es null y stale es false.
export async function getPlatformHealth(
  now = new Date(),
): Promise<PlatformHealth> {
  const row = await prisma.platformSetting.findUnique({
    where: { id: SETTINGS_ID },
    select: { lastJobRunAt: true },
  });
  const pendingOverdue = await prisma.notification.count({
    where: { status: "PENDING", scheduledFor: { lte: now } },
  });

  const lastRunAt = row?.lastJobRunAt ?? null;
  const ageSeconds = lastRunAt
    ? Math.floor((now.getTime() - lastRunAt.getTime()) / 1000)
    : null;
  const stale = ageSeconds !== null && ageSeconds > STALE_AFTER_SECONDS;

  return {
    cron: {
      lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
      ageSeconds,
      stale,
    },
    outbox: { pendingOverdue },
  };
}
