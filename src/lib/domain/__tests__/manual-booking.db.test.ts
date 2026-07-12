import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAppointment } from "../appointments";
import { findOrCreateGuestClient, isSentinelEmail } from "../guest-clients";
import { processDueNotifications } from "@/lib/notifications/service";
import { resetDb, seedBusiness, seedClient } from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");
const IN_30_MIN = new Date("2026-07-12T13:00:00.000Z");

// Cita manual del negocio (mostrador/teléfono): salta la antelación mínima y
// la señal, mantiene el cupo del plan, y los walk-ins sin email usan una
// dirección centinela a la que nunca se envía correo.
describe("cita manual del negocio (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("reserva dentro de la antelación mínima (el cliente online no podría)", async () => {
    const { businessId, serviceId } = await seedBusiness();
    await prisma.business.update({
      where: { id: businessId },
      data: { minNoticeMinutes: 240 }, // 4 h de antelación para clientes
    });
    const clientId = await seedClient();

    // Cliente online: bloqueado por la antelación
    await expect(
      createAppointment({
        businessId,
        serviceId,
        clientId,
        startAt: IN_30_MIN,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

    // El negocio sí puede (walk-in "para dentro de un rato")
    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: IN_30_MIN,
      bookedBy: "business",
      now: NOW,
    });
    expect(appt.status).toBe("CONFIRMED");
  });

  it("no cobra señal aunque el negocio la tenga configurada", async () => {
    const { businessId, serviceId } = await seedBusiness({ priceCents: 2000 });
    await prisma.business.update({
      where: { id: businessId },
      data: { depositPercent: 20 },
    });
    const clientId = await seedClient();
    await prisma.user.update({
      where: { id: clientId },
      data: { stripeCustomerId: "dev_cus_test" },
    });

    const appt = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: new Date("2026-07-15T10:00:00.000Z"),
      bookedBy: "business",
      now: NOW,
    });
    expect(appt.depositStatus).toBe("NONE");
    expect(appt.depositCents).toBe(0);
  });

  it("el cupo del plan free también bloquea las citas manuales", async () => {
    const { businessId, serviceId } = await seedBusiness();
    // free = 50 citas/mes: dejar el negocio al límite con citas ya creadas
    const clientId = await seedClient();
    const base = new Date("2026-07-14T00:00:00.000Z").getTime();
    await prisma.appointment.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        businessId,
        serviceId,
        clientId,
        startAt: new Date(base + i * 3_600_000),
        endAt: new Date(base + i * 3_600_000 + 30 * 60_000),
        status: "CONFIRMED",
        priceCents: 1000,
      })),
    });

    await expect(
      createAppointment({
        businessId,
        serviceId,
        clientId,
        startAt: new Date("2026-07-20T10:00:00.000Z"),
        bookedBy: "business",
        now: NOW,
      }),
    ).rejects.toMatchObject({ httpStatus: 402 });
  });

  it("findOrCreateGuestClient: dedupe por email y reutilización de cuentas", async () => {
    const first = await findOrCreateGuestClient({
      name: "Marta",
      email: "marta@test.local",
      allowClaimedAccounts: true,
    });
    expect(first.created).toBe(true);

    const again = await findOrCreateGuestClient({
      name: "Marta G.",
      email: "MARTA@test.local", // normaliza a minúsculas
      allowClaimedAccounts: true,
    });
    expect(again.created).toBe(false);
    expect(again.clientId).toBe(first.clientId);

    // Cuenta reclamada: el camino admin la reutiliza…
    const claimedId = await seedClient();
    const claimed = await prisma.user.findUniqueOrThrow({
      where: { id: claimedId },
      select: { email: true },
    });
    const viaAdmin = await findOrCreateGuestClient({
      name: "Cliente",
      email: claimed.email,
      allowClaimedAccounts: true,
    });
    expect(viaAdmin.clientId).toBe(claimedId);
    // …pero el camino invitado la rechaza (suplantación)
    await expect(
      findOrCreateGuestClient({
        name: "Cliente",
        email: claimed.email,
        allowClaimedAccounts: false,
      }),
    ).rejects.toMatchObject({ code: "EMAIL_HAS_ACCOUNT" });
  });

  it("walk-in sin email: centinela, y el outbox salta su correo", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const { clientId } = await findOrCreateGuestClient({
      name: "Cliente de mostrador",
      phone: "+34600999888",
      allowClaimedAccounts: true,
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: clientId },
      select: { email: true, guest: true },
    });
    expect(user.guest).toBe(true);
    expect(isSentinelEmail(user.email)).toBe(true);

    // Reutiliza la sombra por teléfono (mismo walk-in que repite)
    const repeat = await findOrCreateGuestClient({
      name: "Cliente de mostrador",
      phone: "+34600999888",
      allowClaimedAccounts: true,
    });
    expect(repeat.clientId).toBe(clientId);

    await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: new Date("2026-07-15T10:00:00.000Z"),
      bookedBy: "business",
      now: NOW,
    });
    // La confirmación por EMAIL al centinela queda SKIPPED, nunca enviada
    // (los recordatorios futuros siguen PENDING hasta vencer; también se
    // saltarán al procesarse).
    await processDueNotifications(NOW);
    const emails = await prisma.notification.findMany({
      where: { businessId, channel: "EMAIL" },
    });
    expect(emails.length).toBeGreaterThan(0);
    expect(emails.some((n) => n.status === "SKIPPED")).toBe(true);
    expect(emails.every((n) => n.status !== "SENT")).toBe(true);
  });
});
