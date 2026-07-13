import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveSegment } from "../campaigns";
import { getBusinessClients } from "../clients";
import {
  IMPORT_NOTE_TEXT,
  importClients,
  importServices,
  parseClientsCsv,
  parseServicesCsv,
} from "../import";
import { resetDb, seedBusiness, seedClient } from "@/lib/test/factories";

describe("parseClientsCsv (parser puro)", () => {
  it("acepta separador ; con cabeceras en español y fechas DD/MM/AAAA", () => {
    const { rows, errors } = parseClientsCsv(
      [
        "nombre;email;telefono;nacimiento",
        "Marta García;MARTA@ejemplo.com;+34600111222;14/05/1990",
        '"Pérez, Juan";;600333444;',
      ].join("\n"),
    );
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([
      {
        name: "Marta García",
        email: "marta@ejemplo.com",
        phone: "+34600111222",
        birthDate: "1990-05-14",
      },
      // comillas: la coma interna no rompe la celda; sin email ni nacimiento
      { name: "Pérez, Juan", email: undefined, phone: "600333444", birthDate: undefined },
    ]);
  });

  it("acepta separador , con cabeceras en inglés (export de Booksy)", () => {
    const { rows, errors } = parseClientsCsv(
      ["Name,E-mail,Phone,Birthday", "John Doe,john@example.com,555111,1985-01-31"].join(
        "\n",
      ),
    );
    expect(errors).toHaveLength(0);
    expect(rows[0]).toEqual({
      name: "John Doe",
      email: "john@example.com",
      phone: "555111",
      birthDate: "1985-01-31",
    });
  });

  it("reporta las filas malas con su número de línea y conserva las buenas", () => {
    const { rows, errors } = parseClientsCsv(
      [
        "nombre;email;nacimiento",
        "X;;", // nombre demasiado corto
        "Ana López;no-es-un-email;", // email inválido
        "Luis Ruiz;;31-12-1990", // fecha en formato no soportado
        "Carla Gil;carla@ejemplo.com;1992-02-29",
      ].join("\n"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Carla Gil");
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4]);
  });

  it("rechaza un CSV sin columna nombre en la cabecera", () => {
    const { rows, errors } = parseClientsCsv("email;telefono\na@b.com;600");
    expect(rows).toHaveLength(0);
    expect(errors[0].line).toBe(1);
  });
});

describe("parseServicesCsv (parser puro)", () => {
  it("convierte precios en euros (coma o punto) a céntimos y valida duración", () => {
    const { rows, errors } = parseServicesCsv(
      [
        "nombre;duracion;precio",
        "Corte de pelo;30;15",
        "Tinte;90;45,50",
        "Malo;3;10", // duración < 5
        "Peor;60;abc", // precio no numérico
      ].join("\n"),
    );
    expect(rows).toEqual([
      { name: "Corte de pelo", durationMinutes: 30, priceCents: 1500 },
      { name: "Tinte", durationMinutes: 90, priceCents: 4550 },
    ]);
    expect(errors.map((e) => e.line)).toEqual([4, 5]);
  });
});

describe("importClients (BD)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("crea sombras nuevas, reutiliza cuentas reclamadas y no duplica al re-importar", async () => {
    const { businessId } = await seedBusiness();
    // Cuenta ya reclamada (registro real): el import debe reutilizarla
    const claimedId = await seedClient();
    const claimed = await prisma.user.findUniqueOrThrow({
      where: { id: claimedId },
      select: { email: true },
    });

    const rows = parseClientsCsv(
      [
        "nombre;email;telefono;nacimiento",
        "Nueva Clienta;nueva@ejemplo.com;;1991-03-10",
        `Cliente Reclamado;${claimed.email};;`,
      ].join("\n"),
    ).rows;

    const first = await importClients(businessId, rows);
    expect(first).toEqual({ created: 1, reused: 1 });

    // Pertenencia por nota de importación, una por cliente
    const notes = await prisma.clientNote.findMany({
      where: { businessId, text: IMPORT_NOTE_TEXT },
    });
    expect(notes).toHaveLength(2);

    // birthDate del CSV aplicado a la sombra nueva
    const shadow = await prisma.user.findUniqueOrThrow({
      where: { email: "nueva@ejemplo.com" },
      select: { birthDate: true, guest: true },
    });
    expect(shadow.guest).toBe(true);
    expect(shadow.birthDate?.toISOString()).toBe("1991-03-10T00:00:00.000Z");

    // Re-importar el mismo archivo: todo reutilizado, sin notas duplicadas
    const second = await importClients(businessId, rows);
    expect(second).toEqual({ created: 0, reused: 2 });
    const notesAfter = await prisma.clientNote.findMany({
      where: { businessId, text: IMPORT_NOTE_TEXT },
    });
    expect(notesAfter).toHaveLength(2);
  });

  it("no pisa el birthDate que el propio cliente ya había aportado", async () => {
    const { businessId } = await seedBusiness();
    const clientId = await seedClient();
    const own = new Date("1980-07-01T00:00:00.000Z");
    const user = await prisma.user.update({
      where: { id: clientId },
      data: { birthDate: own },
      select: { email: true },
    });

    await importClients(businessId, [
      { name: "Otro Nombre", email: user.email, birthDate: "1999-12-31" },
    ]);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: clientId },
      select: { birthDate: true },
    });
    expect(after.birthDate?.toISOString()).toBe(own.toISOString());
  });

  it("los importados sin citas aparecen en la cartera y en el segmento ALL", async () => {
    const { businessId } = await seedBusiness();
    await importClients(businessId, [
      { name: "Importada Sin Citas", email: "sincitas@ejemplo.com" },
    ]);

    const clients = await getBusinessClients(businessId);
    const imported = clients.find((c) => c.email === "sincitas@ejemplo.com");
    expect(imported).toBeDefined();
    expect(imported?.totalAppointments).toBe(0);
    expect(imported?.reliabilityPercent).toBeNull();

    const recipients = await resolveSegment(businessId, "ALL");
    expect(recipients.map((r) => r.email)).toContain("sincitas@ejemplo.com");

    // …pero NO en segmentos de comportamiento (exigen historial de citas)
    const news = await resolveSegment(businessId, "NEW");
    expect(news.map((r) => r.email)).not.toContain("sincitas@ejemplo.com");
  });
});

describe("importServices (BD)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("crea servicios nuevos y omite los ya existentes por nombre (sin duplicar)", async () => {
    const { businessId } = await seedBusiness(); // ya tiene "Servicio"
    const result = await importServices(businessId, [
      { name: "servicio", durationMinutes: 30, priceCents: 1000 }, // existe (case-insensitive)
      { name: "Tinte", durationMinutes: 90, priceCents: 4550 },
      { name: "Tinte", durationMinutes: 60, priceCents: 4000 }, // repetido en el propio CSV
    ]);
    expect(result).toEqual({ created: 1, skippedExisting: 2 });

    const services = await prisma.service.findMany({ where: { businessId } });
    expect(services).toHaveLength(2);
    const tinte = services.find((s) => s.name === "Tinte");
    expect(tinte?.priceCents).toBe(4550);
  });
});
