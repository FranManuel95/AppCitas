import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAuthToken } from "@/lib/auth/tokens";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { POST as resetRoute } from "@/app/api/auth/reset-password/route";
import { POST as rescheduleByToken } from "@/app/api/confirmations/[token]/reschedule/route";
import { cancelAppointment } from "../appointments";
import { createGuestAppointment } from "../guest-booking";
import { resetDb, seedBusiness, seedClient, slotAt } from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");

function guestParams(
  seeded: { businessId: string; serviceId: string },
  overrides?: Partial<Parameters<typeof createGuestAppointment>[0]>,
) {
  return {
    businessId: seeded.businessId,
    serviceId: seeded.serviceId,
    startAt: slotAt("2026-07-15", "10:00"),
    guest: { name: "Lucía Invitada", email: "lucia@test.local" },
    consent: true,
    now: NOW,
    ...overrides,
  };
}

// Reserva sin registro: crea una cuenta sombra reclamable, exige
// consentimiento, nunca pisa cuentas reclamadas, y la cita se gestiona con el
// token del enlace del email (cancelación incluida, con la misma política).
describe("reserva de invitado (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("crea la sombra con consentimiento y la cita confirmada con token", async () => {
    const seeded = await seedBusiness();
    const appt = await createGuestAppointment(guestParams(seeded));

    expect(appt.status).toBe("CONFIRMED");
    expect(appt.confirmationToken).toBeTruthy();

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: appt.clientId },
      select: { guest: true, consentedAt: true, email: true },
    });
    expect(user.guest).toBe(true);
    expect(user.consentedAt).not.toBeNull();
    expect(user.email).toBe("lucia@test.local");
  });

  it("la segunda reserva con el mismo email reutiliza la sombra", async () => {
    const seeded = await seedBusiness();
    const first = await createGuestAppointment(guestParams(seeded));
    const second = await createGuestAppointment(
      guestParams(seeded, { startAt: slotAt("2026-07-16", "11:00") }),
    );
    expect(second.clientId).toBe(first.clientId);
  });

  it("sin consentimiento → CONSENT_REQUIRED", async () => {
    const seeded = await seedBusiness();
    await expect(
      createGuestAppointment(guestParams(seeded, { consent: false })),
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
  });

  it("email de cuenta reclamada → 409 EMAIL_HAS_ACCOUNT (sin tocar la cuenta)", async () => {
    const seeded = await seedBusiness();
    const claimedId = await seedClient();
    const claimed = await prisma.user.findUniqueOrThrow({
      where: { id: claimedId },
      select: { email: true },
    });
    await expect(
      createGuestAppointment(
        guestParams(seeded, {
          guest: { name: "Impostor", email: claimed.email },
        }),
      ),
    ).rejects.toMatchObject({ code: "EMAIL_HAS_ACCOUNT", httpStatus: 409 });
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("negocio con tarjeta obligatoria → 409 CARD_REQUIRED_ACCOUNT", async () => {
    const seeded = await seedBusiness();
    await prisma.business.update({
      where: { id: seeded.businessId },
      data: { requireCardToBook: true },
    });
    await expect(
      createGuestAppointment(guestParams(seeded)),
    ).rejects.toMatchObject({ code: "CARD_REQUIRED_ACCOUNT", httpStatus: 409 });
  });

  it("cancelación con el token: en plazo gratis; tardía sin tarjeta → UNCOLLECTED", async () => {
    const seeded = await seedBusiness({ priceCents: 2000 });
    await prisma.business.update({
      where: { id: seeded.businessId },
      data: { cancellationWindowHours: 24, lateCancellationFeePercent: 50 },
    });

    // En plazo: la cita es dentro de 3 días
    const early = await createGuestAppointment(guestParams(seeded));
    const freeCancel = await cancelAppointment({
      appointmentId: early.id,
      actorUserId: early.clientId,
      actorIsBusinessAdmin: false,
      now: NOW,
    });
    expect(freeCancel.appointment.status).toBe("CANCELLED");
    expect(freeCancel.appointment.chargedCents).toBe(0);

    // Tardía: la cita es dentro de 2 h (< 24 h de ventana); sin tarjeta
    // guardada el cargo queda pendiente de cobro en persona
    const late = await createGuestAppointment(
      guestParams(seeded, { startAt: slotAt("2026-07-12", "14:00") }),
    );
    const lateCancel = await cancelAppointment({
      appointmentId: late.id,
      actorUserId: late.clientId,
      actorIsBusinessAdmin: false,
      now: NOW,
    });
    expect(lateCancel.appointment.status).toBe("CANCELLED_LATE");
    expect(lateCancel.appointment.chargedCents).toBe(1000); // 50 % de 20 €
    expect(lateCancel.appointment.paymentStatus).toBe("UNCOLLECTED");
  });

  it("reprogramación con el token del email: mueve la cita; token falso → 404", async () => {
    const seeded = await seedBusiness();
    // La ruta usa el reloj real (no inyecta `now`): fechas relativas a hoy
    const in3days = new Date(Date.now() + 3 * 86_400_000);
    in3days.setUTCHours(10, 0, 0, 0);
    const newStart = new Date(Date.now() + 4 * 86_400_000);
    newStart.setUTCHours(11, 0, 0, 0);
    const appt = await createGuestAppointment(
      guestParams(seeded, { startAt: in3days, now: undefined }),
    );

    const res = await rescheduleByToken(
      new Request("http://localhost/api/confirmations/x/reschedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startAt: newStart.toISOString() }),
      }),
      { params: Promise.resolve({ token: appt.confirmationToken }) },
    );
    expect(res.status).toBe(200);
    const moved = await prisma.appointment.findUniqueOrThrow({
      where: { id: appt.id },
      select: { startAt: true, status: true },
    });
    expect(moved.startAt.getTime()).toBe(newStart.getTime());
    expect(moved.status).toBe("CONFIRMED");

    const bad = await rescheduleByToken(
      new Request("http://localhost/api/confirmations/x/reschedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startAt: newStart.toISOString() }),
      }),
      { params: Promise.resolve({ token: "token-inexistente-123" }) },
    );
    expect(bad.status).toBe(404);
  });

  it("registro sobre una sombra: enlace de reclamo sin sesión; el reset la reclama", async () => {
    const seeded = await seedBusiness();
    const appt = await createGuestAppointment(guestParams(seeded));

    // Registrarse con el email de la sombra NO abre sesión ni crea usuario:
    // responde 409 y deja un token de reclamo (posesión del email)
    const res = await registerRoute(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Lucía",
          email: "lucia@test.local",
          password: "secreta-123",
        }),
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CLAIM_EMAIL_SENT");
    const tokens = await prisma.authToken.count({
      where: { userId: appt.clientId, type: "PASSWORD_RESET", usedAt: null },
    });
    expect(tokens).toBe(1);

    // Canjear el enlace elige contraseña y reclama la cuenta (guest: false)
    const raw = await createAuthToken(appt.clientId, "PASSWORD_RESET", 30);
    const resetRes = await resetRoute(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: raw, password: "nueva-secreta-123" }),
      }),
    );
    expect(resetRes.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: appt.clientId },
      select: { guest: true, emailVerifiedAt: true },
    });
    expect(user.guest).toBe(false);
    expect(user.emailVerifiedAt).not.toBeNull();
  });
});
