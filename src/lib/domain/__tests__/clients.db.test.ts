import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  addClientNote,
  deleteClientNote,
  getBusinessClients,
  getClientDetail,
} from "../clients";
import { resetDb, seedBusiness, seedClient } from "@/lib/test/factories";

// CRM del negocio: cartera derivada de las citas, métricas de fiabilidad y
// notas privadas, todo aislado por negocio.
describe("clientes del negocio (BD)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function seedAppointment(
    businessId: string,
    serviceId: string,
    clientId: string,
    status: string,
    chargedCents = 0,
    startAt = new Date("2026-07-01T10:00:00.000Z"),
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
        chargedCents,
      },
    });
  }

  it("lista con métricas: visitas, no-shows, gasto y fiabilidad", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    await seedAppointment(businessId, serviceId, clientId, "COMPLETED", 1000);
    await seedAppointment(
      businessId,
      serviceId,
      clientId,
      "COMPLETED",
      1000,
      new Date("2026-07-02T10:00:00.000Z"),
    );
    await seedAppointment(
      businessId,
      serviceId,
      clientId,
      "NO_SHOW",
      500,
      new Date("2026-07-03T10:00:00.000Z"),
    );

    const clients = await getBusinessClients(businessId);
    expect(clients).toHaveLength(1);
    const c = clients[0];
    expect(c.totalAppointments).toBe(3);
    expect(c.completed).toBe(2);
    expect(c.noShows).toBe(1);
    expect(c.spentCents).toBe(2500);
    expect(c.reliabilityPercent).toBe(67); // 2 de 3 juzgadas
    expect(c.lastVisit?.toISOString()).toBe("2026-07-02T10:00:00.000Z");
  });

  it("aísla por negocio: el cliente de otro negocio no aparece", async () => {
    const a = await seedBusiness();
    const b = await seedBusiness();
    const clientId = await seedClient();
    await seedAppointment(b.businessId, b.serviceId, clientId, "COMPLETED");

    expect(await getBusinessClients(a.businessId)).toHaveLength(0);
    await expect(
      getClientDetail(a.businessId, clientId),
    ).rejects.toMatchObject({ code: "CLIENT_NOT_FOUND" });
  });

  it("notas: solo sobre clientes propios, y borrado aislado", async () => {
    const a = await seedBusiness();
    const b = await seedBusiness();
    const clientId = await seedClient();
    await seedAppointment(a.businessId, a.serviceId, clientId, "COMPLETED");

    const note = await addClientNote({
      businessId: a.businessId,
      clientId,
      text: "Prefiere la sala 2",
      authorName: "Dueño",
    });
    expect(note.text).toBe("Prefiere la sala 2");

    // El negocio B no puede anotar (no es su cliente) ni borrar la nota de A.
    await expect(
      addClientNote({ businessId: b.businessId, clientId, text: "x" }),
    ).rejects.toMatchObject({ code: "CLIENT_NOT_FOUND" });
    await expect(
      deleteClientNote({ businessId: b.businessId, noteId: note.id }),
    ).rejects.toMatchObject({ code: "NOTE_NOT_FOUND" });

    const detail = await getClientDetail(a.businessId, clientId);
    expect(detail.notes).toHaveLength(1);

    await deleteClientNote({ businessId: a.businessId, noteId: note.id });
    expect(
      (await getClientDetail(a.businessId, clientId)).notes,
    ).toHaveLength(0);
  });
});
