import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb, seedBusiness } from "@/lib/test/factories";
import { getPlatformHealth, recordJobRun } from "../platform-health";

const NOW = new Date("2026-07-14T10:00:00.000Z");

describe("platform health (BD)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("sella la ejecución del cron y la reporta fresca", async () => {
    await recordJobRun({ sent: 3 }, NOW);
    const health = await getPlatformHealth(new Date(NOW.getTime() + 60_000));

    expect(health.cron.lastRunAt).toBe(NOW.toISOString());
    expect(health.cron.ageSeconds).toBe(60);
    expect(health.cron.stale).toBe(false);
  });

  it("marca stale cuando el cron lleva >15 min sin correr", async () => {
    await recordJobRun({ sent: 0 }, NOW);
    const health = await getPlatformHealth(new Date(NOW.getTime() + 20 * 60_000));

    expect(health.cron.stale).toBe(true);
  });

  it("sin ejecuciones previas no está stale (despliegue reciente)", async () => {
    const health = await getPlatformHealth(NOW);

    expect(health.cron.lastRunAt).toBeNull();
    expect(health.cron.ageSeconds).toBeNull();
    expect(health.cron.stale).toBe(false);
  });

  it("cuenta solo las notificaciones vencidas sin enviar (backlog)", async () => {
    const { businessId } = await seedBusiness();
    await prisma.notification.createMany({
      data: [
        {
          businessId,
          channel: "EMAIL",
          template: "REMINDER",
          recipient: "a@t.local",
          body: "x",
          status: "PENDING",
          scheduledFor: new Date(NOW.getTime() - 60_000),
        },
        {
          businessId,
          channel: "EMAIL",
          template: "REMINDER",
          recipient: "b@t.local",
          body: "x",
          status: "PENDING",
          scheduledFor: new Date(NOW.getTime() + 3_600_000),
        },
        {
          businessId,
          channel: "EMAIL",
          template: "REMINDER",
          recipient: "c@t.local",
          body: "x",
          status: "SENT",
          scheduledFor: new Date(NOW.getTime() - 60_000),
        },
      ],
    });

    const health = await getPlatformHealth(NOW);
    expect(health.outbox.pendingOverdue).toBe(1);
  });
});
