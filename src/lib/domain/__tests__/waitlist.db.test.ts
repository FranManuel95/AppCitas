import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  joinWaitlist,
  leaveWaitlist,
  notifyWaitlistForFreedSlot,
} from "../waitlist";
import { createAppointment, cancelAppointment } from "../appointments";
import { DomainError } from "../errors";
import {
  resetDb,
  seedBusiness,
  seedClient,
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
});
