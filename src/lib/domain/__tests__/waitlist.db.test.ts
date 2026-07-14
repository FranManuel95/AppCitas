import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  adminRemoveWaitlistEntry,
  expireStaleWaitlist,
  getBusinessWaitlist,
  joinWaitlist,
  leaveWaitlist,
  notifyWaitlistForFreedSlot,
  recycleNotifiedWaitlist,
} from "../waitlist";
import { createAppointment, cancelAppointment } from "../appointments";
import { createLocation } from "../locations";
import { DomainError } from "../errors";
import {
  resetDb,
  seedBusiness,
  seedClient,
  seedStaff,
  slotAt,
} from "@/lib/test/factories";

// tz del negocio de prueba = UTC, así que la fecha local coincide con la UTC.
const NOW = new Date("2026-07-01T09:00:00.000Z");
const DAY = "2026-07-10";

describe("lista de espera (BD)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("joinWaitlist crea una entrada WAITING", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();

    const entry = await joinWaitlist({
      businessId,
      serviceId,
      clientId,
      desiredDate: DAY,
      now: NOW,
    });

    expect(entry.status).toBe("WAITING");
    expect(entry.desiredDate).toBe(DAY);
  });

  it("rechaza duplicados vivos del mismo cliente/servicio/día", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    await joinWaitlist({ businessId, serviceId, clientId, desiredDate: DAY, now: NOW });

    await expect(
      joinWaitlist({ businessId, serviceId, clientId, desiredDate: DAY, now: NOW }),
    ).rejects.toMatchObject({ code: "WAITLIST_DUPLICATE" });
  });

  it("aísla: no deja apuntarse a un servicio de otro negocio", async () => {
    const a = await seedBusiness();
    const b = await seedBusiness();
    const clientId = await seedClient();

    // serviceId de A con businessId de B → 404
    await expect(
      joinWaitlist({
        businessId: b.businessId,
        serviceId: a.serviceId,
        clientId,
        desiredDate: DAY,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "SERVICE_NOT_FOUND" });
  });

  it("rechaza un día pasado", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    await expect(
      joinWaitlist({
        businessId,
        serviceId,
        clientId,
        desiredDate: "2026-06-01",
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("leaveWaitlist borra la propia; una ajena da 404", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    const otherId = await seedClient();
    const entry = await joinWaitlist({ businessId, serviceId, clientId, desiredDate: DAY, now: NOW });

    await expect(leaveWaitlist(entry.id, otherId)).rejects.toMatchObject({
      code: "WAITLIST_NOT_FOUND",
    });

    const res = await leaveWaitlist(entry.id, clientId);
    expect(res).toEqual({ deleted: true });
    expect(await prisma.waitlistEntry.count()).toBe(0);
  });

  it("la sede del hueco liberado filtra los avisos (X y 'cualquiera' sí; Y no)", async () => {
    const { businessId, serviceId } = await seedBusiness();
    await seedStaff(businessId);
    const centro = await createLocation(businessId, { name: "Centro" });
    const norte = await createLocation(businessId, { name: "Norte" });

    const quiereCentro = await seedClient();
    const quiereNorte = await seedClient();
    const daIgual = await seedClient();
    await joinWaitlist({
      businessId,
      serviceId,
      clientId: quiereCentro,
      desiredDate: DAY,
      locationId: centro.id,
      now: NOW,
    });
    await joinWaitlist({
      businessId,
      serviceId,
      clientId: quiereNorte,
      desiredDate: DAY,
      locationId: norte.id,
      now: NOW,
    });
    await joinWaitlist({
      businessId,
      serviceId,
      clientId: daIgual,
      desiredDate: DAY,
      now: NOW,
    });

    // Hueco liberado en Centro: avisa a Centro y a "cualquiera", no a Norte
    const { notified } = await notifyWaitlistForFreedSlot({
      businessId,
      serviceId,
      staffId: null,
      locationId: centro.id,
      desiredDate: DAY,
      now: NOW,
    });
    expect(notified).toBe(2);
    const norteEntry = await prisma.waitlistEntry.findFirstOrThrow({
      where: { clientId: quiereNorte },
    });
    expect(norteEntry.status).toBe("WAITING");

    // Sede de OTRO negocio al apuntarse → 404
    const other = await seedBusiness();
    await seedStaff(other.businessId);
    const ajena = await createLocation(other.businessId, { name: "Ajena" });
    await expect(
      joinWaitlist({
        businessId,
        serviceId,
        clientId: daIgual,
        desiredDate: "2026-07-11",
        locationId: ajena.id,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND" });
  });

  it("notifyWaitlistForFreedSlot avisa y marca NOTIFIED (una vez)", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    await joinWaitlist({ businessId, serviceId, clientId, desiredDate: DAY, now: NOW });

    const first = await notifyWaitlistForFreedSlot({
      businessId,
      serviceId,
      staffId: null,
      desiredDate: DAY,
      now: NOW,
    });
    expect(first.notified).toBe(1);

    // Notificación encolada (canal EMAIL por defecto) con la plantilla correcta.
    const notif = await prisma.notification.findFirst({
      where: { businessId, template: "WAITLIST_SLOT_FREED" },
    });
    expect(notif).not.toBeNull();

    const entry = await prisma.waitlistEntry.findFirstOrThrow({ where: { clientId } });
    expect(entry.status).toBe("NOTIFIED");

    // Un segundo aviso ya no la re-selecciona (sigue en 1 notificación).
    const second = await notifyWaitlistForFreedSlot({
      businessId,
      serviceId,
      staffId: null,
      desiredDate: DAY,
      now: NOW,
    });
    expect(second.notified).toBe(0);
  });

  it("al cancelar una cita se avisa a la lista de espera de ese día", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const booker = await seedClient();
    const waiter = await seedClient();

    // Cita confirmada para el DÍA objetivo.
    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId: booker,
      startAt: slotAt(DAY, "10:00"),
      now: NOW,
    });
    // Otro cliente en lista de espera para ese servicio y día.
    await joinWaitlist({ businessId, serviceId, clientId: waiter, desiredDate: DAY, now: NOW });

    await cancelAppointment({
      appointmentId: appt.id,
      actorUserId: booker,
      actorIsBusinessAdmin: false,
      now: NOW,
    });

    const entry = await prisma.waitlistEntry.findFirstOrThrow({
      where: { clientId: waiter },
    });
    expect(entry.status).toBe("NOTIFIED");
  });

  it("getBusinessWaitlist trae las entradas vivas y futuras del negocio, no de otros ni de días pasados", async () => {
    const a = await seedBusiness();
    const b = await seedBusiness();
    const c1 = await seedClient();
    const c2 = await seedClient();

    // Futura en A (cuenta) y otra futura en A de otro cliente (cuenta).
    await joinWaitlist({ businessId: a.businessId, serviceId: a.serviceId, clientId: c1, desiredDate: DAY, now: NOW });
    await joinWaitlist({ businessId: a.businessId, serviceId: a.serviceId, clientId: c2, desiredDate: "2026-07-20", now: NOW });
    // Entrada en B (no debe salir en A).
    await joinWaitlist({ businessId: b.businessId, serviceId: b.serviceId, clientId: c1, desiredDate: DAY, now: NOW });
    // Entrada de día pasado en A (insertada directamente): no debe salir.
    await prisma.waitlistEntry.create({
      data: {
        businessId: a.businessId,
        serviceId: a.serviceId,
        clientId: c1,
        desiredDate: "2026-06-15",
        status: "WAITING",
      },
    });

    const list = await getBusinessWaitlist(a.businessId, NOW);
    expect(list).toHaveLength(2);
    expect(list.every((e) => e.desiredDate >= "2026-07-10")).toBe(true);
    expect(list[0].client.name).toBeDefined();
  });

  it("adminRemoveWaitlistEntry borra la del propio negocio; una ajena da 404", async () => {
    const a = await seedBusiness();
    const b = await seedBusiness();
    const clientId = await seedClient();
    const entry = await joinWaitlist({ businessId: a.businessId, serviceId: a.serviceId, clientId, desiredDate: DAY, now: NOW });

    // El negocio B no puede borrar una entrada de A.
    await expect(
      adminRemoveWaitlistEntry(b.businessId, entry.id),
    ).rejects.toMatchObject({ code: "WAITLIST_NOT_FOUND" });

    const res = await adminRemoveWaitlistEntry(a.businessId, entry.id);
    expect(res).toEqual({ deleted: true });
    expect(await prisma.waitlistEntry.count()).toBe(0);
  });

  it("al reservar se quita la entrada de lista de espera de ese servicio y día", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    await joinWaitlist({ businessId, serviceId, clientId, desiredDate: DAY, now: NOW });

    await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt(DAY, "10:00"),
      now: NOW,
    });

    // La reserva cubre lo que esperaba: su entrada desaparece.
    expect(await prisma.waitlistEntry.count({ where: { clientId } })).toBe(0);
  });

  it("expireStaleWaitlist borra las entradas de días pasados y conserva las futuras", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const clientId = await seedClient();
    // Futura (se conserva) y pasada (se borra), insertada directa para saltar la
    // validación de "día no pasado" de joinWaitlist.
    await joinWaitlist({ businessId, serviceId, clientId, desiredDate: DAY, now: NOW });
    await prisma.waitlistEntry.create({
      data: { businessId, serviceId, clientId, desiredDate: "2026-06-10", status: "WAITING" },
    });

    const res = await expireStaleWaitlist(NOW);
    expect(res.expired).toBe(1);
    const remaining = await prisma.waitlistEntry.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].desiredDate).toBe(DAY);
  });

  it("recycleNotifiedWaitlist reactiva avisos futuros pasado el cooldown, no los recientes", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const c1 = await seedClient();
    const c2 = await seedClient();
    // Avisado hace 3 h (fuera de cooldown) → se recicla.
    await prisma.waitlistEntry.create({
      data: {
        businessId, serviceId, clientId: c1, desiredDate: DAY, status: "NOTIFIED",
        notifiedAt: new Date(NOW.getTime() - 3 * 60 * 60_000),
      },
    });
    // Avisado hace 10 min (dentro de cooldown) → NO se recicla.
    await prisma.waitlistEntry.create({
      data: {
        businessId, serviceId, clientId: c2, desiredDate: DAY, status: "NOTIFIED",
        notifiedAt: new Date(NOW.getTime() - 10 * 60_000),
      },
    });

    const res = await recycleNotifiedWaitlist(NOW);
    expect(res.recycled).toBe(1);
    const recycled = await prisma.waitlistEntry.findFirstOrThrow({ where: { clientId: c1 } });
    expect(recycled.status).toBe("WAITING");
    expect(recycled.notifiedAt).toBeNull();
    const kept = await prisma.waitlistEntry.findFirstOrThrow({ where: { clientId: c2 } });
    expect(kept.status).toBe("NOTIFIED");
  });
});
