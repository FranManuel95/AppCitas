import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { processWinbacks } from "../winback";
import {
  unsubscribeToken,
  verifyUnsubscribeToken,
} from "@/lib/marketing-token";
import { resetDb, seedBusiness, seedClient, slotAt } from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");
const DAY = 86_400_000;

describe("token de baja (puro)", () => {
  it("firma y verifica; manipulado o malformado se rechaza", () => {
    const token = unsubscribeToken("user123");
    expect(verifyUnsubscribeToken(token)).toBe("user123");
    expect(verifyUnsubscribeToken(`${token}x`)).toBeNull();
    expect(verifyUnsubscribeToken("sin-punto")).toBeNull();
    expect(verifyUnsubscribeToken("otro.deadbeef")).toBeNull();
  });
});

describe("win-back (BD)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function seedCompleted(
    businessId: string,
    serviceId: string,
    clientId: string,
    daysAgo: number,
  ) {
    const startAt = new Date(NOW.getTime() - daysAgo * DAY);
    return prisma.appointment.create({
      data: {
        businessId,
        serviceId,
        clientId,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        status: "COMPLETED",
        priceCents: 1000,
      },
    });
  }

  it("encola el aviso una sola vez y respeta cita posterior y opt-out", async () => {
    const { businessId, serviceId } = await seedBusiness();
    await prisma.business.update({
      where: { id: businessId },
      data: { winbackDays: 30 },
    });

    const candidato = await seedClient(); // última cita hace 35 días → aviso
    const volvio = await seedClient(); // tiene cita posterior → no
    const optOut = await seedClient(); // sin consentimiento → no

    await seedCompleted(businessId, serviceId, candidato, 35);
    const oldVisit = await seedCompleted(businessId, serviceId, volvio, 35);
    await prisma.appointment.create({
      data: {
        businessId,
        serviceId,
        clientId: volvio,
        startAt: slotAt("2026-07-20", "10:00"),
        endAt: slotAt("2026-07-20", "10:30"),
        status: "CONFIRMED",
        priceCents: 1000,
      },
    });
    await seedCompleted(businessId, serviceId, optOut, 35);
    await prisma.user.update({
      where: { id: optOut },
      data: { marketingConsent: false },
    });

    const queued = await processWinbacks(NOW);
    expect(queued).toBe(1);

    const notifications = await prisma.notification.findMany({
      where: { template: "WINBACK" },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].body).toContain("/baja/");
    expect(notifications[0].body).toContain("/reservar");

    // Idempotencia: la segunda pasada no encola nada (claim winbackQueuedAt)
    expect(await processWinbacks(NOW)).toBe(0);
    expect(
      await prisma.notification.count({ where: { template: "WINBACK" } }),
    ).toBe(1);

    // Las descartadas también quedan marcadas (no se re-examinan)
    const oldRow = await prisma.appointment.findUniqueOrThrow({
      where: { id: oldVisit.id },
    });
    expect(oldRow.winbackQueuedAt).not.toBeNull();
  });

  it("fuera de la ventana (muy reciente o más antigua que el suelo) no encola", async () => {
    const { businessId, serviceId } = await seedBusiness();
    await prisma.business.update({
      where: { id: businessId },
      data: { winbackDays: 30 },
    });
    const reciente = await seedClient();
    const antiguo = await seedClient();
    await seedCompleted(businessId, serviceId, reciente, 10); // aún no toca
    await seedCompleted(businessId, serviceId, antiguo, 60); // fuera del suelo (30+14)

    expect(await processWinbacks(NOW)).toBe(0);
  });

  it("negocio sin winbackDays: ni una consulta de candidatas", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    await seedCompleted(businessId, serviceId, clientId, 35);
    expect(await processWinbacks(NOW)).toBe(0);
    expect(
      await prisma.notification.count({ where: { template: "WINBACK" } }),
    ).toBe(0);
  });
});
