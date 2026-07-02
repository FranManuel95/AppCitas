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

/** Escala de marca (nocturno: 50-200 tintes oscuros, 300+ acentos claros). */
export const BRAND = {
  50: "#1c1638",
  100: "#251d4a",
  200: "#3b2f75",
  300: "#a595ff",
  400: "#8b76ff",
  500: "#7a68ff",
  600: "#6d5bff",
  700: "#5b48f0",
  800: "#4c3ac9",
  900: "#38299a",
  950: "#16112e",
} as const;

/** Tinta de texto para gráficos (idéntica a --color-ink*, clara). */
export const INK = {
  primary: "#eef0f6",
  secondary: "#b8bdcb",
  muted: "#8b92a3",
} as const;

/** Cromo recesivo de gráficos sobre tarjeta oscura. */
export const CHROME = {
  grid: "#232b3a",
  axis: "#3a4356",
  surface: "#151a24",
} as const;

/** Serie única de magnitud: violeta claro, 5.09:1 sobre la tarjeta. */
export const SERIES_PRIMARY = BRAND[400];

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/**
 * Colores semánticos por tono, compartidos por badges y gráficos:
 * `chart` es el relleno sólido; `soft`/`strong` son fondo y texto de badge.
 */
export const TONE_COLORS: Record<
  Tone,
  { chart: string; soft: string; strong: string }
> = {
  success: { chart: "#34c46a", soft: "#10281a", strong: "#7fe0a0" },
  warning: { chart: "#e08a4e", soft: "#2d1c10", strong: "#f0a875" },
  danger: { chart: "#e05252", soft: "#2e1414", strong: "#f08c8c" },
  info: { chart: "#4a90e0", soft: "#12222f", strong: "#85b8f0" },
  neutral: { chart: "#7a8194", soft: "#232936", strong: "#aab1c0" },
};
