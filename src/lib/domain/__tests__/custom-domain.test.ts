import { afterEach, describe, expect, it } from "vitest";
import {
  customHostRewritePath,
  isAppHost,
  normalizeCustomDomain,
} from "@/lib/custom-domain";

const ORIGINAL_BASE = process.env.APP_BASE_URL;

afterEach(() => {
  if (ORIGINAL_BASE === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = ORIGINAL_BASE;
});

describe("normalizeCustomDomain", () => {
  it("limpia protocolo, ruta y puerto y pasa a minúsculas", () => {
    expect(normalizeCustomDomain("https://Reservas.MiClinica.com/")).toBe(
      "reservas.miclinica.com",
    );
    expect(normalizeCustomDomain("midominio.es:443")).toBe("midominio.es");
  });

  it("rechaza valores que no son un dominio", () => {
    expect(normalizeCustomDomain("no es un dominio")).toBeNull();
    expect(normalizeCustomDomain("localhost")).toBeNull();
    expect(normalizeCustomDomain("-mal.com")).toBeNull();
    expect(normalizeCustomDomain("sinpunto")).toBeNull();
  });
});

describe("customHostRewritePath", () => {
  it("reescribe la raíz de un host ajeno a /d/{host}", () => {
    process.env.APP_BASE_URL = "https://appcitas.example.com";
    expect(customHostRewritePath("reservas.miclinica.com", "/")).toBe(
      "/d/reservas.miclinica.com",
    );
    // Solo la raíz: el resto de rutas sirven la app normal
    expect(
      customHostRewritePath("reservas.miclinica.com", "/b/mi-clinica/reservar"),
    ).toBeNull();
    expect(customHostRewritePath("reservas.miclinica.com", "/api/health")).toBeNull();
  });

  it("nunca reescribe los hosts de la app", () => {
    process.env.APP_BASE_URL = "https://appcitas.example.com";
    expect(isAppHost("appcitas.example.com")).toBe(true);
    expect(isAppHost("www.appcitas.example.com")).toBe(true);
    expect(isAppHost("localhost:3000")).toBe(true);
    expect(isAppHost("mi-app.vercel.app")).toBe(true);
    expect(customHostRewritePath("appcitas.example.com", "/")).toBeNull();
    expect(customHostRewritePath(null, "/")).toBeNull();
  });
});
