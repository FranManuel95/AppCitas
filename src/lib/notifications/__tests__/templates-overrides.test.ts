import { describe, expect, it } from "vitest";
import {
  bookingConfirmedMessage,
  cancellationMessage,
  parseTemplateOverrides,
  reminderMessage,
  validateTemplateOverrides,
  type AppointmentMessageContext,
} from "../templates";

const CTX: AppointmentMessageContext = {
  clientName: "Marta",
  businessName: "Estudio Aurora",
  serviceName: "Corte de pelo",
  staffName: null,
  startAt: new Date("2026-09-18T10:00:00.000Z"),
  timezone: "UTC",
  currency: "EUR",
  priceCents: 2500,
  cancellationWindowHours: 24,
  lateCancellationFeePercent: 50,
  confirmationUrl: "https://app.test/c/tok123",
};

describe("plantillas de notificación editables", () => {
  it("el override sustituye las variables con los datos de la cita", () => {
    const msg = bookingConfirmedMessage(CTX, {
      BOOKING_CONFIRMED: {
        subject: "¡Te esperamos, {cliente}!",
        body: "{servicio} el {fecha} a las {hora} ({precio}). Gestiona: {enlace}",
      },
    });
    expect(msg.subject).toBe("¡Te esperamos, Marta!");
    expect(msg.body).toContain("Corte de pelo el ");
    expect(msg.body).toContain("viernes"); // 2026-09-18 es viernes
    expect(msg.body).toContain("a las 10:00");
    expect(msg.body).toContain("25,00");
    expect(msg.body).toContain("https://app.test/c/tok123");
  });

  it("sin override se usa el texto por defecto", () => {
    const msg = bookingConfirmedMessage(CTX);
    expect(msg.subject).toBe("Cita confirmada en Estudio Aurora");
    expect(msg.body).toContain("tu cita está confirmada");
  });

  it("{sede} renderiza nombre · dirección, y vacío sin sede", () => {
    const withLocation = bookingConfirmedMessage(
      { ...CTX, locationName: "Sede Centro", locationAddress: "Calle Mayor 1" },
      { BOOKING_CONFIRMED: { body: "Te esperamos en {sede}. {enlace}" } },
    );
    expect(withLocation.body).toContain(
      "Te esperamos en Sede Centro · Calle Mayor 1.",
    );

    const withoutLocation = bookingConfirmedMessage(CTX, {
      BOOKING_CONFIRMED: { body: "Te esperamos en {sede}. {enlace}" },
    });
    expect(withoutLocation.body).toContain("Te esperamos en .");

    // El texto por defecto añade la línea 📍 solo si hay sede
    const defaultWith = bookingConfirmedMessage({
      ...CTX,
      locationName: "Sede Centro",
      locationAddress: null,
    });
    expect(defaultWith.body).toContain("📍 Sede Centro");
    expect(bookingConfirmedMessage(CTX).body).not.toContain("📍");

    // {sede} es variable válida en la validación de overrides
    expect(
      validateTemplateOverrides({ REMINDER: { body: "En {sede}: {enlace}" } })
        .ok,
    ).toBe(true);
  });

  it("cliente en inglés: texto y fecha en inglés; override del negocio gana; null → es", () => {
    const enMsg = bookingConfirmedMessage({ ...CTX, locale: "en" });
    expect(enMsg.subject).toBe("Appointment confirmed at Estudio Aurora");
    expect(enMsg.body).toContain("your appointment is confirmed");
    expect(enMsg.body).toContain("Friday"); // fecha formateada en inglés

    // El texto propio del negocio es monolingüe y gana SIEMPRE
    const overridden = bookingConfirmedMessage(
      { ...CTX, locale: "en" },
      { BOOKING_CONFIRMED: { body: "Texto del negocio: {enlace}" } },
    );
    expect(overridden.body).toContain("Texto del negocio:");

    // Sin locale → español
    expect(bookingConfirmedMessage(CTX).subject).toBe(
      "Cita confirmada en Estudio Aurora",
    );
    expect(reminderMessage({ ...CTX, locale: "en" }).subject).toBe(
      "Reminder: your appointment at Estudio Aurora",
    );
    expect(cancellationMessage({ ...CTX, locale: "en" }, 0).body).toContain(
      "has been cancelled",
    );
  });

  it("un override parcial (solo subject) mantiene el body por defecto", () => {
    const msg = bookingConfirmedMessage(CTX, {
      BOOKING_CONFIRMED: { subject: "Reserva OK en {negocio}" },
    });
    expect(msg.subject).toBe("Reserva OK en Estudio Aurora");
    expect(msg.body).toContain("tu cita está confirmada");
  });

  it("el recordatorio personalizado sin {enlace} recibe el enlace al final", () => {
    const msg = reminderMessage(CTX, {
      REMINDER: { body: "Mañana tienes {servicio} a las {hora}." },
    });
    expect(msg.body).toContain("Mañana tienes Corte de pelo a las 10:00.");
    expect(msg.body).toContain("https://app.test/c/tok123");
  });

  it("la cancelación personalizada conserva la línea del cargo", () => {
    const conCargo = cancellationMessage(CTX, 1250, {
      CANCELLED: { body: "Tu cita en {negocio} quedó anulada, {cliente}." },
    });
    expect(conCargo.body).toContain("quedó anulada, Marta");
    expect(conCargo.body).toContain("12,50");

    const sinCargo = cancellationMessage(CTX, 0, {
      CANCELLED: { body: "Anulada." },
    });
    expect(sinCargo.body).toContain("sin coste");
  });

  it("una variable sin valor conocido queda tal cual (no rompe el mensaje)", () => {
    // parseTemplateOverrides ya rechaza variables desconocidas al guardar;
    // esto cubre JSON antiguo o editado a mano.
    const msg = bookingConfirmedMessage(CTX, {
      BOOKING_CONFIRMED: { body: "Hola {cliente} {loquesea}" },
    });
    expect(msg.body).toBe("Hola Marta {loquesea}");
  });
});

describe("validateTemplateOverrides", () => {
  it("rechaza variables desconocidas", () => {
    const result = validateTemplateOverrides({
      REMINDER: { body: "Hola {clientes}" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("{clientes}");
  });

  it("rechaza claves de plantilla desconocidas", () => {
    const result = validateTemplateOverrides({ HACK: { body: "x" } });
    expect(result.ok).toBe(false);
  });

  it("rechaza textos que superan la longitud máxima", () => {
    const result = validateTemplateOverrides({
      REMINDER: { body: "x".repeat(1001) },
    });
    expect(result.ok).toBe(false);
  });

  it("los campos vacíos se descartan y un objeto sin overrides es null", () => {
    const result = validateTemplateOverrides({
      REMINDER: { subject: "  ", body: "" },
      CANCELLED: {},
    });
    expect(result).toEqual({ ok: true, value: null });
  });

  it("normaliza y conserva los overrides válidos", () => {
    const result = validateTemplateOverrides({
      REMINDER: { body: "  Recuerda {servicio} — {enlace}  " },
    });
    expect(result).toEqual({
      ok: true,
      value: { REMINDER: { body: "Recuerda {servicio} — {enlace}" } },
    });
  });
});

describe("parseTemplateOverrides", () => {
  it("tolera null y JSON inválido devolviendo objeto vacío", () => {
    expect(parseTemplateOverrides(null)).toEqual({});
    expect(parseTemplateOverrides("{no es json")).toEqual({});
    expect(parseTemplateOverrides('{"HACK":{"body":"x"}}')).toEqual({});
  });

  it("recupera lo guardado por la API", () => {
    const stored = JSON.stringify({ NO_SHOW: { body: "Faltaste, {cliente}" } });
    expect(parseTemplateOverrides(stored)).toEqual({
      NO_SHOW: { body: "Faltaste, {cliente}" },
    });
  });
});
