import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  generateTotpSecret,
  totpKeyUri,
  verifyTotpCode,
} from "@/lib/auth/totp";
import { authenticator } from "otplib";
import { anonymizeGuestClient } from "../gdpr";
import { createGuestAppointment } from "../guest-booking";
import { resetDb, seedBusiness, seedClient, slotAt } from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");

describe("2FA TOTP", () => {
  it("acepta el código vigente del secreto y rechaza los demás", () => {
    const secret = generateTotpSecret();
    const valid = authenticator.generate(secret);
    expect(verifyTotpCode(valid, secret)).toBe(true);
    expect(verifyTotpCode("000000", secret)).toBe(
      valid === "000000", // salvo colisión astronómica, false
    );
    expect(verifyTotpCode("abc123", secret)).toBe(false);
    expect(verifyTotpCode("", secret)).toBe(false);
    expect(totpKeyUri("dueno@test.local", secret)).toContain("AppCitas");
  });
});

describe("anonimización RGPD desde el negocio (BD)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("anonimiza una sombra del negocio conservando sus citas", async () => {
    const seeded = await seedBusiness();
    const appt = await createGuestAppointment({
      businessId: seeded.businessId,
      serviceId: seeded.serviceId,
      startAt: slotAt("2026-07-15", "10:00"),
      guest: { name: "Paco Olvido", email: "paco@test.local", phone: "+34600" },
      consent: true,
      now: NOW,
    });

    await anonymizeGuestClient({
      businessId: seeded.businessId,
      clientId: appt.clientId,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: appt.clientId },
    });
    expect(user.name).toBe("Cliente eliminado");
    expect(user.email).not.toContain("paco");
    expect(user.phone).toBeNull();
    // La cita sigue existiendo (histórico) pero anónima
    expect(await prisma.appointment.count({ where: { clientId: user.id } })).toBe(1);
    // Sus avisos pendientes quedan retirados
    const pending = await prisma.notification.count({
      where: { appointment: { clientId: user.id }, status: "PENDING" },
    });
    expect(pending).toBe(0);
  });

  it("rechaza cuentas reales y sombras con citas en otros negocios", async () => {
    const seeded = await seedBusiness();
    // Cuenta real (no sombra)
    const realId = await seedClient();
    await prisma.appointment.create({
      data: {
        businessId: seeded.businessId,
        serviceId: seeded.serviceId,
        clientId: realId,
        startAt: slotAt("2026-07-15", "09:00"),
        endAt: slotAt("2026-07-15", "09:30"),
        status: "CONFIRMED",
        priceCents: 1000,
      },
    });
    await expect(
      anonymizeGuestClient({
        businessId: seeded.businessId,
        clientId: realId,
      }),
    ).rejects.toMatchObject({ code: "CLIENT_NOT_GUEST" });

    // Sombra compartida entre dos negocios
    const other = await seedBusiness();
    const shared = await createGuestAppointment({
      businessId: seeded.businessId,
      serviceId: seeded.serviceId,
      startAt: slotAt("2026-07-16", "10:00"),
      guest: { name: "Compartida", email: "compartida@test.local" },
      consent: true,
      now: NOW,
    });
    await createGuestAppointment({
      businessId: other.businessId,
      serviceId: other.serviceId,
      startAt: slotAt("2026-07-16", "12:00"),
      guest: { name: "Compartida", email: "compartida@test.local" },
      consent: true,
      now: NOW,
    });
    await expect(
      anonymizeGuestClient({
        businessId: seeded.businessId,
        clientId: shared.clientId,
      }),
    ).rejects.toMatchObject({ code: "CLIENT_SHARED" });
  });
});
