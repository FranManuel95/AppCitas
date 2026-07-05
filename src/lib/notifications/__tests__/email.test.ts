import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { composeFrom } from "../channels/email";

// El correo sale con el NOMBRE del negocio como remitente pero el dominio
// verificado de la plataforma (SMTP_FROM), por entregabilidad.
describe("composeFrom (remitente por negocio)", () => {
  const original = process.env.SMTP_FROM;
  beforeEach(() => {
    process.env.SMTP_FROM = "AppCitas <no-reply@tudominio.com>";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.SMTP_FROM;
    else process.env.SMTP_FROM = original;
  });

  it("sin nombre de negocio usa el remitente base", () => {
    expect(composeFrom(null)).toBe("AppCitas <no-reply@tudominio.com>");
    expect(composeFrom(undefined)).toBe("AppCitas <no-reply@tudominio.com>");
  });

  it("usa el nombre del negocio con el dominio verificado", () => {
    expect(composeFrom("Estudio Aurora")).toBe(
      "Estudio Aurora <no-reply@tudominio.com>",
    );
  });

  it("saca la dirección aunque SMTP_FROM sea solo el email", () => {
    process.env.SMTP_FROM = "no-reply@tudominio.com";
    expect(composeFrom("Barbería Norte")).toBe(
      "Barbería Norte <no-reply@tudominio.com>",
    );
  });

  it("sanea el nombre para evitar inyección de cabeceras", () => {
    const from = composeFrom('Malo"\r\nBcc: evil@e.com');
    // Nunca debe colarse un salto de línea ni comillas en la cabecera.
    expect(from).not.toMatch(/[\r\n"]/);
    expect(from.endsWith("<no-reply@tudominio.com>")).toBe(true);
  });
});
