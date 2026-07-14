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

  it("purga el outbox resuelto: SENT>90d fuera, FAILED 90-180d se conserva, PENDING nunca", async () => {
    const { businessId } = await seedBusiness();
    const DAY = 86_400_000;
    const mk = (status: string, ageDays: number, scheduledFor: Date) =>
      prisma.notification.create({
        data: {
          businessId,
          channel: "EMAIL",
          template: "REMINDER",
          recipient: "x@test.local",
          body: "b",
          status,
          scheduledFor,
          createdAt: new Date(NOW.getTime() - ageDays * DAY),
        },
      });
    const past = new Date(NOW.getTime() - 100 * DAY);
    const future = new Date(NOW.getTime() + DAY);

    await mk("SENT", 100, past); // se purga
    await mk("SKIPPED", 100, past); // se purga
    await mk("FAILED", 100, past); // se conserva (<180d)
    await mk("FAILED", 200, past); // se purga
    // Antigua pero programada a futuro: el drenaje no la toca y la purga
    // jamás borra PENDING, por vieja que sea su fila
    const pending = await mk("PENDING", 200, future);

    const result = await runScheduledJobs(NOW);
    expect(result.purged.notifications).toBe(3);

    const remaining = await prisma.notification.findMany({
      select: { id: true, status: true },
    });
    expect(remaining.map((n) => n.id)).toContain(pending.id);
    expect(
      remaining.filter((n) => n.status === "FAILED"),
    ).toHaveLength(1);
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
      "watchChannelsRenewed",
    ] as const) {
      expect(result[key]).toBe(0);
    }
    expect(result.purged).toEqual({
      auditLogs: 0,
      webhookEvents: 0,
      notifications: 0,
      calendarSyncJobs: 0,
    });
  });
});
