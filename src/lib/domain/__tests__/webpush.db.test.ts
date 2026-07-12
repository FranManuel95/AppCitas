import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAppointment } from "../appointments";
import { resetDb, seedBusiness, seedClient, slotAt } from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");

// Push web: al reservar se encola el canal WEBPUSH (recipient = userId) solo
// si el cliente tiene algún dispositivo suscrito; sin claves VAPID el canal
// queda sin configurar y el envío se salta (SKIPPED / dev-log).
describe("push web (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  it("cliente con dispositivo suscrito → filas WEBPUSH; sin él, no", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const withPush = await seedClient();
    const withoutPush = await seedClient();
    await prisma.pushSubscription.create({
      data: {
        userId: withPush,
        endpoint: "https://push.example/device-1",
        p256dh: "clave-p256dh-de-prueba",
        auth: "auth-x",
      },
    });

    await createAppointment({
      businessId,
      serviceId,
      clientId: withPush,
      startAt: slotAt("2026-07-15", "10:00"),
      now: NOW,
    });
    await createAppointment({
      businessId,
      serviceId,
      clientId: withoutPush,
      startAt: slotAt("2026-07-15", "12:00"),
      now: NOW,
    });

    const pushRows = await prisma.notification.findMany({
      where: { businessId, channel: "WEBPUSH" },
      select: { recipient: true },
    });
    expect(pushRows.length).toBeGreaterThan(0);
    expect(pushRows.every((n) => n.recipient === withPush)).toBe(true);
  });
});
