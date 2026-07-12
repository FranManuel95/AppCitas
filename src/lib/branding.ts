import type { CSSProperties } from "react";

// Marca por negocio: a partir de UN color de acento (hex) se derivan los
// tonos que usa el sistema de diseño y se inyectan como variables CSS en un
// contenedor. Todo lo que dentro use los tokens brand-* adopta la marca del
// negocio sin tocar una sola clase.

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function channel(hex: string, i: number): number {
  return parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
}

/** Mezcla `hex` con `other` (t = proporción de `other`, 0..1). */
export function mixHex(hex: string, other: string, t: number): string {
  const parts = [0, 1, 2].map((i) => {
    const a = channel(hex, i);
    const b = channel(other, i);
    return Math.round(a + (b - a) * t)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${parts.join("")}`;
}

export function brandStyle(
  color: string | null | undefined,
): CSSProperties | undefined {
  if (!color || !HEX_RE.test(color)) return undefined;
  return {
    "--color-brand-50": mixHex(color, "#ffffff", 0.93),
    "--color-brand-100": mixHex(color, "#ffffff", 0.86),
    "--color-brand-200": mixHex(color, "#ffffff", 0.72),
    "--color-brand-300": mixHex(color, "#ffffff", 0.55),
    "--color-brand-400": mixHex(color, "#ffffff", 0.28),
    "--color-brand-500": mixHex(color, "#ffffff", 0.12),
    "--color-brand-600": color,
    "--color-brand-700": mixHex(color, "#000000", 0.18),
    "--color-brand-800": mixHex(color, "#000000", 0.32),
    "--color-brand-900": mixHex(color, "#000000", 0.45),
  } as CSSProperties;
}
