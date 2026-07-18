import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb, seedBusiness, seedClient, slotAt } from "@/lib/test/factories";
import { SENTINEL_EMAIL_DOMAIN } from "@/lib/domain/guest-clients";

// El canal WhatsApp se mockea SIEMPRE fallando: al tercer intento la fila pasa
// a FAILED (dead-letter) y, con NOTIFY_FALLBACK_EMAIL=true, debe encolarse un
// email de respaldo con el mismo contenido — salvo hermana EMAIL previa o
// cliente sin email real.
vi.mock("@/lib/notifications/channels/whatsapp", () => ({
  whatsappChannel: {
    key: "WHATSAPP",
    isConfigured: () => true,
    send: vi.fn(async () => ({ ok: false, error: "gateway caído" })),
  },
  whatsappUsesCloudApi: () => false,
}));

import { processDueNotifications } from "../service";

const NOW = new Date("2026-08-03T10:00:00.000Z");

async function seedFailingWhatsapp(opts?: { clientEmail?: string }) {
  const { businessId, serviceId } = await seedBusiness();
  let clientId: string;
  if (opts?.clientEmail) {
    const user = await prisma.user.create({
      data: {
        email: opts.clientEmail,
        name: "Invitada",
        passwordHash: "x",
        role: "CLIENT",
      },
    });
    clientId = user.id;
  } else {
    clientId = await seedClient();
  }
  const appointment = await prisma.appointment.create({
    data: {
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-08-04", "10:00"),
      endAt: slotAt("2026-08-04", "10:30"),
      priceCents: 1000,
    },
  });
  // Tercer intento (attempts=2): el fallo la manda a dead-letter.
  const notification = await prisma.notification.create({
    data: {
      businessId,
      appointmentId: appointment.id,
      channel: "WHATSAPP",
      template: "REMINDER",
      recipient: "+34600111222",
      subject: "Recordatorio",
      body: "Tu cita es mañana",
      status: "PENDING",
      scheduledFor: new Date(NOW.getTime() - 60_000),
      attempts: 2,
    },
  });
  return { businessId, appointmentId: appointment.id, notificationId: notification.id, clientId };
}

describe("fallback a email al agotar reintentos (BD)", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("con NOTIFY_FALLBACK_EMAIL=true encola un email de respaldo", async () => {
    vi.stubEnv("NOTIFY_FALLBACK_EMAIL", "true");
    const { appointmentId, notificationId } = await seedFailingWhatsapp();

    await processDueNotifications(NOW);

    const original = await prisma.notification.findUniqueOrThrow({
      where: { id: notificationId },
    });
    expect(original.status).toBe("FAILED");

    const fallback = await prisma.notification.findFirst({
      where: { appointmentId, channel: "EMAIL" },
    });
    expect(fallback).not.toBeNull();
    expect(fallback!.template).toBe("REMINDER");
    expect(fallback!.subject).toBe("Recordatorio");
    expect(fallback!.body).toBe("Tu cita es mañana");
    expect(fallback!.recipient).toContain("@test.local");
  });

  it("no duplica si el fan-out ya encoló una hermana EMAIL", async () => {
    vi.stubEnv("NOTIFY_FALLBACK_EMAIL", "true");
    const { businessId, appointmentId } = await seedFailingWhatsapp();
    await prisma.notification.create({
      data: {
        businessId,
        appointmentId,
        channel: "EMAIL",
        template: "REMINDER",
        recipient: "cliente@test.local",
        subject: "Recordatorio",
        body: "Tu cita es mañana",
        status: "SENT",
        scheduledFor: new Date(NOW.getTime() - 60_000),
      },
    });

    await processDueNotifications(NOW);

    const emails = await prisma.notification.count({
      where: { appointmentId, channel: "EMAIL" },
    });
    expect(emails).toBe(1);
  });

  it("con el env apagado (default) no encola respaldo", async () => {
    const { appointmentId, notificationId } = await seedFailingWhatsapp();

    await processDueNotifications(NOW);

    const original = await prisma.notification.findUniqueOrThrow({
      where: { id: notificationId },
    });
    expect(original.status).toBe("FAILED");
    expect(
      await prisma.notification.count({
        where: { appointmentId, channel: "EMAIL" },
      }),
    ).toBe(0);
  });

  it("cliente con email centinela (invitado sin email): no encola respaldo", async () => {
    vi.stubEnv("NOTIFY_FALLBACK_EMAIL", "true");
    const { appointmentId } = await seedFailingWhatsapp({
      clientEmail: `walkin-abc@${SENTINEL_EMAIL_DOMAIN}`,
    });

    await processDueNotifications(NOW);

    expect(
      await prisma.notification.count({
        where: { appointmentId, channel: "EMAIL" },
      }),
    ).toBe(0);
  });
});
