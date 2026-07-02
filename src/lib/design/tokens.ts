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
  50: "#f3f1fd",
  100: "#e9e5fb",
  200: "#d6cef8",
  300: "#b9abf2",
  400: "#977fe9",
  500: "#7a5ce0",
  600: "#5b3fd6",
  700: "#4c32b8",
  800: "#3f2b96",
  900: "#352878",
  950: "#21174d",
} as const;

/** Tinta de texto para gráficos (idéntica a --color-ink*). */
export const INK = {
  primary: "#16161d",
  secondary: "#4b4b57",
  muted: "#6e6e7a",
} as const;

/** Cromo recesivo de gráficos: rejilla, ejes y superficie. */
export const CHROME = {
  grid: "#e7e7ef",
  axis: "#c9c9d6",
  surface: "#ffffff",
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
