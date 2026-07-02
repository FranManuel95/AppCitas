/**
 * Tokens de diseño compartidos entre CSS y JavaScript.
 *
 * Recharts y otros consumidores JS necesitan valores hex literales, así que
 * este módulo duplica los valores definidos en `src/app/globals.css` (@theme).
 * Si cambias un color aquí, cámbialo también allí — ambos archivos señalan
 * esta regla.
 *
 * Contrastes verificados (WCAG): blanco sobre brand-600 6.72:1; texto fuerte
 * sobre fondo suave ≥4.5:1 en todos los tonos; rellenos de gráfico ≥3:1
 * sobre blanco.
 */

/** Escala de marca. Cambiar el hue aquí + globals.css re-tiñe toda la app. */
export const BRAND = {
  50: "#fbf3ee",
  100: "#f7e8de",
  200: "#eed0bc",
  300: "#e3b294",
  400: "#d38d64",
  500: "#bc6636",
  600: "#9e421b",
  700: "#833614",
  800: "#6b2d13",
  900: "#572715",
  950: "#30130a",
} as const;

/** Tinta de texto para gráficos (idéntica a --color-ink*). */
export const INK = {
  primary: "#211d1a",
  secondary: "#55504a",
  muted: "#726b62",
} as const;

/** Cromo recesivo de gráficos: rejilla, ejes y superficie. */
export const CHROME = {
  grid: "#e9e3d8",
  axis: "#cec5b4",
  surface: "#fffdfa",
} as const;

/** Serie única de magnitud (ingresos, totales): el color de marca. */
export const SERIES_PRIMARY = BRAND[600];

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/**
 * Colores semánticos por tono, compartidos por badges y gráficos:
 * `chart` es el relleno sólido; `soft`/`strong` son fondo y texto de badge.
 */
export const TONE_COLORS: Record<
  Tone,
  { chart: string; soft: string; strong: string }
> = {
  success: { chart: "#0ca30c", soft: "#e7f6e7", strong: "#0a7a0a" },
  warning: { chart: "#d4682a", soft: "#fdeee4", strong: "#9a4112" },
  danger: { chart: "#d03b3b", soft: "#fdebeb", strong: "#b02a2a" },
  info: { chart: "#2a78d6", soft: "#e8f1fb", strong: "#1d5eb0" },
  neutral: { chart: "#8b8b98", soft: "#eef0f4", strong: "#475569" },
};
