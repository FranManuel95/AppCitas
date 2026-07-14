import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  addClientNote,
  deleteClientNote,
  getBusinessClients,
  getClientDetail,
  updateClientBirthDate,
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

  async function seedGuest(): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `guest-${crypto.randomUUID()}@test.local`,
        name: "Invitado de prueba",
        passwordHash: "x",
        role: "CLIENT",
        guest: true,
      },
    });
    return user.id;
  }

  it("cumpleaños: el negocio lo apunta a un invitado y puede quitarlo", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const guestId = await seedGuest();
    await seedAppointment(businessId, serviceId, guestId, "COMPLETED");

    const updated = await updateClientBirthDate({
      businessId,
      clientId: guestId,
      birthDate: "1990-05-10",
    });
    expect(updated.birthDate?.toISOString()).toBe("1990-05-10T00:00:00.000Z");

    // La ficha lo expone
    const detail = await getClientDetail(businessId, guestId);
    expect(detail.client.birthDate?.toISOString()).toBe(
      "1990-05-10T00:00:00.000Z",
    );

    // Y se puede borrar (el invitado puede corregirse siempre)
    const cleared = await updateClientBirthDate({
      businessId,
      clientId: guestId,
      birthDate: null,
    });
    expect(cleared.birthDate).toBeNull();
  });

  it("cumpleaños: pertenencia por nota (importado sin citas) también vale", async () => {
    const { businessId } = await seedBusiness();
    const guestId = await seedGuest();
    await prisma.clientNote.create({
      data: { businessId, clientId: guestId, text: "Importado de CSV" },
    });

    const updated = await updateClientBirthDate({
      businessId,
      clientId: guestId,
      birthDate: "1985-12-01",
    });
    expect(updated.birthDate?.toISOString()).toBe("1985-12-01T00:00:00.000Z");
  });

  it("cumpleaños: la fecha que aportó una cuenta propia no se pisa (409)", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient(); // cuenta real (guest = false)
    await prisma.user.update({
      where: { id: clientId },
      data: { birthDate: new Date("1992-03-08T00:00:00.000Z") },
    });
    await seedAppointment(businessId, serviceId, clientId, "COMPLETED");

    await expect(
      updateClientBirthDate({
        businessId,
        clientId,
        birthDate: "2000-01-01",
      }),
    ).rejects.toMatchObject({ code: "BIRTHDATE_LOCKED", httpStatus: 409 });

    // Cuenta real SIN fecha: sí se puede completar desde el mostrador
    const other = await seedClient();
    await seedAppointment(businessId, serviceId, other, "COMPLETED");
    const updated = await updateClientBirthDate({
      businessId,
      clientId: other,
      birthDate: "1988-07-20",
    });
    expect(updated.birthDate?.toISOString()).toBe("1988-07-20T00:00:00.000Z");
  });

  it("cumpleaños: cliente de otro negocio → 404", async () => {
    const a = await seedBusiness();
    const b = await seedBusiness();
    const guestId = await seedGuest();
    await seedAppointment(b.businessId, b.serviceId, guestId, "COMPLETED");

    await expect(
      updateClientBirthDate({
        businessId: a.businessId,
        clientId: guestId,
        birthDate: "1990-01-01",
      }),
    ).rejects.toMatchObject({ code: "CLIENT_NOT_FOUND", httpStatus: 404 });
  });

  it("filtra la cartera por nombre o email (buscador)", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const marta = await prisma.user.create({
      data: {
        email: "marta@ejemplo.local",
        name: "Marta García",
        passwordHash: "x",
        role: "CLIENT",
      },
    });
    const juan = await prisma.user.create({
      data: {
        email: "juan@ejemplo.local",
        name: "Juan Pérez",
        passwordHash: "x",
        role: "CLIENT",
      },
    });
    await seedAppointment(businessId, serviceId, marta.id, "COMPLETED", 1000);
    await seedAppointment(businessId, serviceId, juan.id, "COMPLETED", 1000);

    expect(await getBusinessClients(businessId)).toHaveLength(2);

    const byName = await getBusinessClients(businessId, "mar");
    expect(byName).toHaveLength(1);
    expect(byName[0].name).toBe("Marta García");

    const byEmail = await getBusinessClients(businessId, "juan@ejemplo");
    expect(byEmail).toHaveLength(1);
    expect(byEmail[0].name).toBe("Juan Pérez");

    expect(await getBusinessClients(businessId, "nadie")).toHaveLength(0);
  });
});
