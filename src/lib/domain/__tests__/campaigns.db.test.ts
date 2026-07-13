import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  CAMPAIGN_SEGMENTS,
  getSegmentCounts,
  resolveSegment,
  sendCampaign,
} from "../campaigns";
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

  it("getSegmentCounts (una pasada) coincide con resolveSegment en cartera variada", async () => {
    const { businessId, serviceId } = await seedBusiness();

    // Cartera variada que ejercita todas las reglas:
    const nuevo = await seedClient(); // primera cita hace 5 días
    const fiel = await seedClient(); // 3 completadas antiguas
    const inactivo = await seedClient(); // última hace 90 días
    const cumple = await seedClient(); // cumpleaños dentro de la ventana
    const soloNota = await seedClient(); // importado sin citas (solo nota)
    const sombra = await seedClient(); // email sentinel: inalcanzable

    await seedApptAt(businessId, serviceId, nuevo, new Date("2026-07-01T10:00:00Z"));
    for (const day of ["2026-05-01", "2026-05-08", "2026-05-15"]) {
      await seedApptAt(businessId, serviceId, fiel, new Date(`${day}T10:00:00Z`));
    }
    await seedApptAt(businessId, serviceId, inactivo, new Date("2026-04-01T10:00:00Z"));
    await seedApptAt(businessId, serviceId, cumple, new Date("2026-06-01T10:00:00Z"));
    await prisma.user.update({
      where: { id: cumple },
      data: { birthDate: new Date("1990-07-20T00:00:00.000Z") },
    });
    await prisma.clientNote.create({
      data: { businessId, clientId: soloNota, text: "Importado de CSV" },
    });
    await prisma.user.update({
      where: { id: sombra },
      data: { email: `walkin-abc123@sin-email.appcitas.local` },
    });
    await seedApptAt(businessId, serviceId, sombra, new Date("2026-07-02T10:00:00Z"));

    const counts = await getSegmentCounts(businessId, NOW);
    for (const segment of CAMPAIGN_SEGMENTS) {
      const resolved = await resolveSegment(businessId, segment, NOW);
      expect(counts[segment], segment).toBe(resolved.length);
    }
    // Y los valores esperados a mano, para no validar un bug contra sí mismo
    expect(counts.ALL).toBe(5); // todos menos el sentinel
    expect(counts.NEW).toBe(1);
    expect(counts.LOYAL).toBe(1);
    expect(counts.INACTIVE).toBe(1);
    expect(counts.BIRTHDAY).toBe(1);
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
