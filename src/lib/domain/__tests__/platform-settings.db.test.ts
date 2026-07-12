import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getPlatformSettings,
  updatePlatformSettings,
} from "../platform-settings";
import { getPlatformEconomics } from "../platform";
import { resetDb, seedBusiness } from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");

describe("economía de la plataforma (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    await prisma.platformSetting.deleteMany();
  });

  it("la primera lectura crea la fila con los valores por defecto", async () => {
    const settings = await getPlatformSettings();
    expect(settings.stripeFeeBps).toBe(140);
    expect(settings.fixedMonthlyCostCents).toBe(0);
    expect(await prisma.platformSetting.count()).toBe(1);
  });

  it("actualizar persiste y valida rangos", async () => {
    await updatePlatformSettings({ fixedMonthlyCostCents: 10_000 });
    expect((await getPlatformSettings()).fixedMonthlyCostCents).toBe(10_000);
    await expect(
      updatePlatformSettings({ stripeFeeBps: 5000 }),
    ).rejects.toMatchObject({ code: "INVALID_SETTING" });
    await expect(
      updatePlatformSettings({ smsMsgCostCents: -1 }),
    ).rejects.toMatchObject({ code: "INVALID_SETTING" });
  });

  it("getPlatformEconomics cuenta solo los mensajes SENT del mes en curso", async () => {
    const { businessId } = await seedBusiness();
    await prisma.business.update({
      where: { id: businessId },
      data: { plan: "pro", subscriptionStatus: "active" },
    });

    const mkNotification = (channel: string, status: string, sentAt: Date | null) =>
      prisma.notification.create({
        data: {
          businessId,
          channel,
          template: "REMINDER",
          recipient: "x",
          body: "x",
          status,
          scheduledFor: NOW,
          sentAt,
        },
      });
    await mkNotification("WHATSAPP", "SENT", new Date("2026-07-05T10:00:00Z"));
    await mkNotification("WHATSAPP", "SENT", new Date("2026-07-10T10:00:00Z"));
    await mkNotification("WHATSAPP", "SENT", new Date("2026-06-25T10:00:00Z")); // mes anterior
    await mkNotification("WHATSAPP", "FAILED", new Date("2026-07-06T10:00:00Z")); // no enviada
    await mkNotification("SMS", "SENT", new Date("2026-07-07T10:00:00Z"));

    const eco = await getPlatformEconomics(NOW);
    expect(eco.proActive).toBe(1);
    expect(eco.revenueCents).toBe(2900);
    expect(eco.whatsappSentThisMonth).toBe(2);
    expect(eco.smsSentThisMonth).toBe(1);
    // costes por defecto: stripe 66 + mensajería (2×5 + 1×8 = 18) + fijos 0
    expect(eco.totalCostCents).toBe(66 + 18);
    expect(eco.profitCents).toBe(2900 - 84);
  });
});
