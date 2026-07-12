import { describe, expect, it } from "vitest";
import { brandStyle, mixHex } from "../branding";

describe("marca por negocio (brandStyle)", () => {
  it("mixHex interpola canales hacia blanco y negro", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#d64545", "#ffffff", 1)).toBe("#ffffff");
    expect(mixHex("#d64545", "#000000", 0)).toBe("#d64545");
  });

  it("deriva la escala completa con el color como brand-600", () => {
    const style = brandStyle("#d64545") as Record<string, string>;
    expect(style["--color-brand-600"]).toBe("#d64545");
    // Los tonos claros se acercan al blanco y los oscuros al negro
    expect(style["--color-brand-50"]).not.toBe("#d64545");
    expect(style["--color-brand-700"]).not.toBe("#d64545");
    expect(Object.keys(style)).toHaveLength(10);
  });

  it("rechaza valores no válidos (sin estilo → tema por defecto)", () => {
    expect(brandStyle(null)).toBeUndefined();
    expect(brandStyle("")).toBeUndefined();
    expect(brandStyle("rojo")).toBeUndefined();
    expect(brandStyle("#fff")).toBeUndefined();
    expect(brandStyle('#d645"5')).toBeUndefined();
  });
});
