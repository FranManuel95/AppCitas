import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { runScheduledJobs } from "@/lib/jobs";
import { resetDb, seedBusiness } from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");

// Las tareas programadas comparten implementación entre el endpoint de cron y
// el worker local (src/lib/jobs.ts). Lo crítico: el outbox se DRENA por lotes
// (antes había un techo de 50 mensajes por ejecución).
describe("runScheduledJobs (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("drena más de un lote de notificaciones vencidas en una sola pasada", async () => {
    const { businessId } = await seedBusiness();
    // 120 avisos vencidos: obliga a 3 lotes de 50 (valida el bucle de drenaje)
    await prisma.notification.createMany({
      data: Array.from({ length: 120 }, (_, i) => ({
        businessId,
        channel: "EMAIL",
        template: "REMINDER",
        recipient: `cliente${i}@test.local`,
        subject: "Recordatorio",
        body: "Tu cita es mañana",
        scheduledFor: new Date(NOW.getTime() - 60_000),
      })),
    });

    const result = await runScheduledJobs(NOW);
    // Sin SMTP y fuera de producción, el canal "envía" al log → SENT
    expect(result.sent).toBe(120);
    const pending = await prisma.notification.count({
      where: { status: "PENDING" },
    });
    expect(pending).toBe(0);
  });

  it("devuelve el agregado completo de todas las tareas", async () => {
    const result = await runScheduledJobs(NOW);
    for (const key of [
      "sent",
      "failed",
      "skipped",
      "autoClosed",
      "trialsDegraded",
      "waitlistExpired",
      "waitlistRecycled",
      "invoicesIssued",
      "membershipsRenewed",
      "membershipsEnded",
      "calendarEventsSynced",
    ] as const) {
      expect(result[key]).toBe(0);
    }
    expect(result.purged).toEqual({ auditLogs: 0, webhookEvents: 0 });
  });
});
