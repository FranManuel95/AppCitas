import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveSegment, sendCampaign } from "../campaigns";
import { resetDb, seedBusiness, seedClient } from "@/lib/test/factories";

const NOW = new Date("2026-07-06T12:00:00.000Z");

// Campañas: segmentación calculada sobre el historial real y envíos por el
// outbox, con gating del plan Pro.
describe("campañas de marketing (BD)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function seedApptAt(
    businessId: string,
    serviceId: string,
    clientId: string,
    startAt: Date,
    status = "COMPLETED",
  ) {
    return prisma.appointment.create({
      data: {
        businessId,
        serviceId,
        clientId,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        status,
        priceCents: 1000,
      },
    });
  }

  async function makePro(businessId: string) {
    await prisma.business.update({
      where: { id: businessId },
      data: { plan: "pro", subscriptionStatus: "active" },
    });
  }

  it("segmenta nuevos, fieles e inactivos según el historial", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const nuevo = await seedClient(); // primera cita hace 5 días
    const fiel = await seedClient(); // 3 completadas
    const inactivo = await seedClient(); // última hace 90 días

    await seedApptAt(businessId, serviceId, nuevo, new Date("2026-07-01T10:00:00Z"));
    for (const day of ["2026-05-01", "2026-05-08", "2026-05-15"]) {
      await seedApptAt(businessId, serviceId, fiel, new Date(`${day}T10:00:00Z`));
    }
    await seedApptAt(businessId, serviceId, inactivo, new Date("2026-04-01T10:00:00Z"));

    const ids = async (segment: "ALL" | "NEW" | "LOYAL" | "INACTIVE") =>
      (await resolveSegment(businessId, segment, NOW)).map((r) => r.clientId);

    expect(await ids("ALL")).toHaveLength(3);
    expect(await ids("NEW")).toEqual([nuevo]);
    expect(await ids("LOYAL")).toEqual([fiel]);
    expect(await ids("INACTIVE")).toEqual([inactivo]);
  });

  it("plan free: las campañas devuelven 402", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    await seedApptAt(businessId, serviceId, clientId, new Date("2026-07-01T10:00:00Z"));
    await expect(
      sendCampaign({
        businessId,
        segment: "ALL",
        channel: "EMAIL",
        subject: "Hola",
        body: "Oferta",
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "PLAN_LIMIT", httpStatus: 402 });
  });

  it("encola por el outbox y filtra por canal (WhatsApp requiere teléfono)", async () => {
    const { businessId, serviceId } = await seedBusiness();
    await makePro(businessId);
    const conTelefono = await seedClient();
    const sinTelefono = await seedClient();
    await prisma.user.update({
      where: { id: conTelefono },
      data: { phone: "+34600111222" },
    });
    await seedApptAt(businessId, serviceId, conTelefono, new Date("2026-07-01T10:00:00Z"));
    await seedApptAt(businessId, serviceId, sinTelefono, new Date("2026-07-01T11:00:00Z"));

    const emailCampaign = await sendCampaign({
      businessId,
      segment: "ALL",
      channel: "EMAIL",
      subject: "Novedades",
      body: "Texto",
      now: NOW,
    });
    expect(emailCampaign.recipientCount).toBe(2);

    const waCampaign = await sendCampaign({
      businessId,
      segment: "ALL",
      channel: "WHATSAPP",
      body: "Texto WA",
      now: NOW,
    });
    expect(waCampaign.recipientCount).toBe(1); // solo el que tiene teléfono

    const queued = await prisma.notification.findMany({
      where: { businessId, template: "CAMPAIGN" },
    });
    expect(queued).toHaveLength(3); // 2 emails + 1 whatsapp
    expect(
      queued.filter((n) => n.channel === "WHATSAPP").map((n) => n.recipient),
    ).toEqual(["+34600111222"]);
  });

  it("el email exige asunto", async () => {
    const { businessId, serviceId } = await seedBusiness();
    await makePro(businessId);
    const clientId = await seedClient();
    await seedApptAt(businessId, serviceId, clientId, new Date("2026-07-01T10:00:00Z"));
    await expect(
      sendCampaign({
        businessId,
        segment: "ALL",
        channel: "EMAIL",
        body: "Sin asunto",
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "CAMPAIGN_SUBJECT_REQUIRED" });
  });
});
