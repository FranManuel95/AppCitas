import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getExternalBusy } from "@/lib/calendar/freebusy";
import {
  createSimulatedConnection,
  signCalendarState,
  verifyCalendarState,
} from "@/lib/calendar/oauth";
import {
  cancelAppointment,
  createAppointment,
  getAvailability,
} from "../appointments";
import { resetDb, seedBusiness, seedClient, seedStaff, slotAt } from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");

describe("crypto (AES-256-GCM)", () => {
  it("cifra y descifra; el dato manipulado falla", () => {
    const sealed = encryptSecret("token-secreto-123");
    expect(sealed).not.toContain("token-secreto-123");
    expect(decryptSecret(sealed)).toBe("token-secreto-123");

    const [iv, ct, tag] = sealed.split(".");
    const tampered = `${iv}.${ct.slice(0, -2)}aa.${tag}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe("state OAuth (JWT)", () => {
  it("firma y verifica el state; uno manipulado se rechaza", async () => {
    const token = await signCalendarState({
      sub: "user1",
      businessId: "biz1",
      staffId: "staff1",
    });
    const state = await verifyCalendarState(token);
    expect(state).toEqual({ sub: "user1", businessId: "biz1", staffId: "staff1" });

    await expect(verifyCalendarState(`${token}x`)).rejects.toMatchObject({
      code: "CALENDAR_STATE_INVALID",
    });
  });
});

describe("sincronización saliente (BD, conexión simulada)", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it("reservar crea el evento (link) y cancelar lo borra", async () => {
    const { businessId, serviceId } = await seedBusiness();
    await createSimulatedConnection({ businessId, staffId: null });
    const clientId = await seedClient();

    const appointment = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-20", "10:00"),
      now: NOW,
    });

    // El intento en línea procesa el job y crea el enlace cita→evento
    const link = await prisma.calendarEventLink.findFirst({
      where: { appointmentId: appointment.id },
    });
    expect(link).not.toBeNull();
    expect(link!.googleEventId.startsWith("dev_evt_")).toBe(true);
    const jobs = await prisma.calendarSyncJob.findMany({
      where: { appointmentId: appointment.id },
    });
    expect(jobs.every((j) => j.status === "SENT")).toBe(true);

    await cancelAppointment({
      appointmentId: appointment.id,
      actorUserId: clientId,
      actorIsBusinessAdmin: false,
      now: NOW,
    });
    const linkAfter = await prisma.calendarEventLink.findFirst({
      where: { appointmentId: appointment.id },
    });
    expect(linkAfter).toBeNull();
  });

  it("la conexión del empleado solo refleja SUS citas", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const staffA = await seedStaff(businessId);
    const staffB = await seedStaff(businessId);
    await createSimulatedConnection({ businessId, staffId: staffA });
    const clientId = await seedClient();

    const forB = await createAppointment({
      businessId,
      serviceId,
      clientId,
      staffId: staffB,
      startAt: slotAt("2026-07-20", "10:00"),
      now: NOW,
    });
    const jobsForB = await prisma.calendarSyncJob.count({
      where: { appointmentId: forB.id },
    });
    expect(jobsForB).toBe(0); // la conexión es de A: la cita de B no le llega

    const forA = await createAppointment({
      businessId,
      serviceId,
      clientId,
      staffId: staffA,
      startAt: slotAt("2026-07-20", "11:00"),
      now: NOW,
    });
    const linkForA = await prisma.calendarEventLink.findFirst({
      where: { appointmentId: forA.id },
    });
    expect(linkForA).not.toBeNull();
  });
});

describe("freebusy entrante (BD, vía caché)", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("los intervalos ocupados de la caché bloquean la oferta de huecos", async () => {
    const { businessId, serviceId } = await seedBusiness({
      durationMinutes: 60,
    });
    await createSimulatedConnection({ businessId, staffId: null });
    const connection = await prisma.calendarConnection.findFirstOrThrow({
      where: { businessId },
    });

    // Caché fresca con "ocupado" de 10:00 a 11:00 (evento personal externo)
    await prisma.calendarBusyCache.create({
      data: {
        connectionId: connection.id,
        dateISO: "2026-07-20",
        busyJson: JSON.stringify([
          {
            start: "2026-07-20T10:00:00.000Z",
            end: "2026-07-20T11:00:00.000Z",
          },
        ]),
        fetchedAt: NOW,
      },
    });

    const external = await getExternalBusy({
      businessId,
      dateISO: "2026-07-20",
      dayStart: slotAt("2026-07-20", "00:00"),
      dayEnd: slotAt("2026-07-21", "00:00"),
      now: NOW,
    });
    expect(external.businessLevel).toHaveLength(1);

    // Sin equipo: la conexión de negocio bloquea la agenda única
    const slots = await getAvailability({
      businessId,
      serviceId,
      dateISO: "2026-07-20",
      now: NOW,
    });
    const starts = slots.map((s) => s.start.toISOString());
    expect(starts).not.toContain("2026-07-20T10:00:00.000Z");
    expect(starts).toContain("2026-07-20T11:00:00.000Z");
  });
});
