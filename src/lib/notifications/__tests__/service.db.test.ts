import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb, seedBusiness } from "@/lib/test/factories";

// Se mockea el canal EMAIL como "configurado" y con resultado controlable, para
// ejercitar el despacho real contra la BD: claim atómico (exclusividad),
// reintentos con backoff y dead-letter tras agotar los intentos.
const mock = vi.hoisted(() => ({
  result: { ok: true, providerRef: "ref-1" } as {
    ok: boolean;
    providerRef?: string;
    error?: string;
  },
  send: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock("@/lib/notifications/channels/email", () => {
  mock.send = vi.fn(async () => mock.result);
  return {
    emailChannel: {
      key: "EMAIL",
      isConfigured: () => true,
      send: mock.send,
    },
  };
});

import { flushDueNotifications, processDueNotifications } from "../service";

const NOW = new Date("2020-01-06T10:00:00.000Z");

async function seedNotification(overrides: {
  status?: string;
  scheduledFor?: Date;
  attempts?: number;
}) {
  const { businessId } = await seedBusiness();
  return prisma.notification.create({
    data: {
      businessId,
      channel: "EMAIL",
      template: "REMINDER",
      recipient: "cliente@test.local",
      subject: "Recordatorio",
      body: "Tu cita es mañana",
      status: overrides.status ?? "PENDING",
      scheduledFor: overrides.scheduledFor ?? new Date(NOW.getTime() - 60_000),
      attempts: overrides.attempts ?? 0,
    },
  });
}

describe("processDueNotifications (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    mock.result = { ok: true, providerRef: "ref-1" };
    mock.send?.mockClear();
  });

  it("envía una notificación vencida y la marca SENT", async () => {
    const n = await seedNotification({});
    const res = await processDueNotifications(NOW);

    expect(res.sent).toBe(1);
    expect(mock.send).toHaveBeenCalledTimes(1);
    const after = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.status).toBe("SENT");
    expect(after.providerRef).toBe("ref-1");
  });

  it("no toca una notificación aún no vencida", async () => {
    const n = await seedNotification({
      scheduledFor: new Date(NOW.getTime() + 3_600_000),
    });
    await processDueNotifications(NOW);

    expect(mock.send).not.toHaveBeenCalled();
    const after = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.status).toBe("PENDING");
  });

  it("reintenta con backoff si el envío falla (sin agotar intentos)", async () => {
    mock.result = { ok: false, error: "SMTP caído" };
    const n = await seedNotification({ attempts: 0 });
    await processDueNotifications(NOW);

    const after = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.status).toBe("PENDING");
    expect(after.attempts).toBe(1);
    // Backoff lineal: se reprograma al futuro respecto a `now`.
    expect(after.scheduledFor.getTime()).toBeGreaterThan(NOW.getTime());
    expect(after.lastError).toBe("SMTP caído");
  });

  it("marca FAILED tras agotar los reintentos (dead-letter)", async () => {
    mock.result = { ok: false, error: "SMTP caído" };
    const n = await seedNotification({ attempts: 2 }); // 3º intento = el último
    await processDueNotifications(NOW);

    const after = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.status).toBe("FAILED");
    expect(after.attempts).toBe(3);
  });

  it("no reenvía una notificación ya reclamada (SENDING) reciente", async () => {
    const n = await seedNotification({ status: "SENDING" });
    await processDueNotifications(NOW);

    expect(mock.send).not.toHaveBeenCalled();
    const after = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.status).toBe("SENDING");
  });

  it("despacha varias notificaciones vencidas en una pasada (envío en paralelo)", async () => {
    await Promise.all([
      seedNotification({}),
      seedNotification({}),
      seedNotification({}),
    ]);
    const res = await processDueNotifications(NOW);

    expect(res.sent).toBe(3);
    expect(mock.send).toHaveBeenCalledTimes(3);
    const sentCount = await prisma.notification.count({
      where: { status: "SENT" },
    });
    expect(sentCount).toBe(3);
  });

  it("flushDueNotifications saca las vencidas en el acto y nunca lanza", async () => {
    const n = await seedNotification({});
    await expect(flushDueNotifications(NOW)).resolves.toBeUndefined();

    expect(mock.send).toHaveBeenCalledTimes(1);
    const after = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.status).toBe("SENT");
  });

  it("recupera un SENDING huérfano (worker caído) y lo procesa", async () => {
    // La recuperación compara con el updatedAt real de la fila (ahora), así que
    // se parte del tiempo real: la fila queda SENDING con updatedAt≈ahora y se
    // procesa 20 min después (umbral de huérfano: 10 min).
    const base = new Date();
    const n = await seedNotification({
      status: "SENDING",
      scheduledFor: new Date(base.getTime() - 60_000),
    });
    const res = await processDueNotifications(new Date(base.getTime() + 20 * 60_000));

    expect(res.sent).toBe(1);
    const after = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.status).toBe("SENT");
  });
});
