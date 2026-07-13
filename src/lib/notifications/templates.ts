import { formatCents } from "@/lib/money";

// Plantillas de mensajes en texto plano: válidas para email, SMS y WhatsApp.
//
// El negocio puede personalizar el texto de cada plantilla desde
// /admin/notificaciones (Business.notificationTemplates, JSON). El override
// usa variables {cliente} {negocio} {servicio} {fecha} {hora} {precio}
// {enlace}; sin override se usa el texto por defecto de este archivo.

export interface AppointmentMessageContext {
  clientName: string;
  businessName: string;
  serviceName: string;
  staffName?: string | null;
  startAt: Date;
  timezone: string;
  currency: string;
  priceCents: number;
  cancellationWindowHours: number;
  lateCancellationFeePercent: number;
  confirmationUrl: string;
}

export const CUSTOMIZABLE_TEMPLATES = [
  "BOOKING_CONFIRMED",
  "REMINDER",
  "CANCELLED",
  "NO_SHOW",
] as const;
export type CustomizableTemplate = (typeof CUSTOMIZABLE_TEMPLATES)[number];

export const TEMPLATE_VARIABLES = [
  "cliente",
  "negocio",
  "servicio",
  "fecha",
  "hora",
  "precio",
  "enlace",
] as const;

export interface TemplateOverride {
  subject?: string;
  body?: string;
}
export type TemplateOverrides = Partial<
  Record<CustomizableTemplate, TemplateOverride>
>;

const SUBJECT_MAX = 120;
const BODY_MAX = 1000;

/**
 * Valida el JSON de overrides que llega de la API: solo claves de plantilla
 * conocidas, solo variables conocidas y longitudes acotadas. Devuelve el
 * objeto limpio (sin entradas vacías) o un error legible.
 */
export function validateTemplateOverrides(
  input: unknown,
): { ok: true; value: TemplateOverrides | null } | { ok: false; error: string } {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Formato de plantillas no válido" };
  }
  const out: TemplateOverrides = {};
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!CUSTOMIZABLE_TEMPLATES.includes(key as CustomizableTemplate)) {
      return { ok: false, error: `Plantilla desconocida: ${key}` };
    }
    if (raw === null || raw === undefined) continue;
    if (typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: `Formato no válido en ${key}` };
    }
    const entry: TemplateOverride = {};
    for (const field of ["subject", "body"] as const) {
      const value = (raw as Record<string, unknown>)[field];
      if (value === undefined || value === null) continue;
      if (typeof value !== "string") {
        return { ok: false, error: `Formato no válido en ${key}.${field}` };
      }
      const text = value.trim();
      if (!text) continue; // vacío = usar el texto por defecto
      const max = field === "subject" ? SUBJECT_MAX : BODY_MAX;
      if (text.length > max) {
        return {
          ok: false,
          error: `El texto de ${key} supera los ${max} caracteres`,
        };
      }
      const unknown = unknownVariables(text);
      if (unknown.length > 0) {
        return {
          ok: false,
          error: `Variable desconocida ${unknown[0]} (usa ${TEMPLATE_VARIABLES.map((v) => `{${v}}`).join(" ")})`,
        };
      }
      entry[field] = text;
    }
    if (entry.subject || entry.body) out[key as CustomizableTemplate] = entry;
  }
  return { ok: true, value: Object.keys(out).length > 0 ? out : null };
}

function unknownVariables(text: string): string[] {
  const found = text.match(/\{[^}]*\}/g) ?? [];
  return found.filter(
    (token) =>
      !TEMPLATE_VARIABLES.includes(
        token.slice(1, -1) as (typeof TEMPLATE_VARIABLES)[number],
      ),
  );
}

/** Parsea el JSON guardado en Business.notificationTemplates (tolerante). */
export function parseTemplateOverrides(
  raw: string | null | undefined,
): TemplateOverrides {
  if (!raw) return {};
  try {
    const result = validateTemplateOverrides(JSON.parse(raw));
    return result.ok ? (result.value ?? {}) : {};
  } catch {
    return {};
  }
}

function formatDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

function formatDateOnly(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "full",
    timeZone: timezone,
  }).format(date);
}

function formatTimeOnly(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

/** Sustituye las variables {…} del texto propio con los datos de la cita. */
export function renderTemplate(
  text: string,
  ctx: AppointmentMessageContext,
): string {
  const values: Record<string, string> = {
    cliente: ctx.clientName,
    negocio: ctx.businessName,
    servicio: ctx.serviceName,
    fecha: formatDateOnly(ctx.startAt, ctx.timezone),
    hora: formatTimeOnly(ctx.startAt, ctx.timezone),
    precio: formatCents(ctx.priceCents, ctx.currency),
    enlace: ctx.confirmationUrl,
  };
  return text.replace(/\{([a-z]+)\}/g, (token, name: string) =>
    name in values ? values[name] : token,
  );
}

export function bookingConfirmedMessage(
  ctx: AppointmentMessageContext,
  overrides?: TemplateOverrides,
): {
  subject: string;
  body: string;
} {
  const when = formatDateTime(ctx.startAt, ctx.timezone);
  const staffLine = ctx.staffName ? `\nTe atenderá: ${ctx.staffName}` : "";
  const custom = overrides?.BOOKING_CONFIRMED;
  return {
    subject: custom?.subject
      ? renderTemplate(custom.subject, ctx)
      : `Cita confirmada en ${ctx.businessName}`,
    body: custom?.body
      ? renderTemplate(custom.body, ctx)
      : `Hola ${ctx.clientName}, tu cita está confirmada. ✅\n\n` +
        `${ctx.serviceName} en ${ctx.businessName}\n` +
        `📅 ${when}${staffLine}\n` +
        `💶 ${formatCents(ctx.priceCents, ctx.currency)}\n\n` +
        `Puedes cancelar gratis hasta ${ctx.cancellationWindowHours} horas antes. ` +
        `Después se cobra el ${ctx.lateCancellationFeePercent}% del servicio.\n` +
        `Gestiona tu cita: ${ctx.confirmationUrl}`,
  };
}

export function reminderMessage(
  ctx: AppointmentMessageContext,
  overrides?: TemplateOverrides,
): {
  subject: string;
  body: string;
} {
  const when = formatDateTime(ctx.startAt, ctx.timezone);
  const staffLine = ctx.staffName ? ` con ${ctx.staffName}` : "";
  const custom = overrides?.REMINDER;
  if (custom?.subject || custom?.body) {
    // El enlace de confirmación no puede perderse: si el texto propio no
    // incluye {enlace}, se añade al final.
    let bodyTemplate = custom.body;
    if (bodyTemplate && !bodyTemplate.includes("{enlace}")) {
      bodyTemplate += `\n\nConfirma o cancela tu cita: {enlace}`;
    }
    return {
      subject: custom.subject
        ? renderTemplate(custom.subject, ctx)
        : `Recordatorio: tu cita en ${ctx.businessName}`,
      body: bodyTemplate
        ? renderTemplate(bodyTemplate, ctx)
        : defaultReminderBody(ctx, when, staffLine),
    };
  }
  return {
    subject: `Recordatorio: tu cita en ${ctx.businessName}`,
    body: defaultReminderBody(ctx, when, staffLine),
  };
}

function defaultReminderBody(
  ctx: AppointmentMessageContext,
  when: string,
  staffLine: string,
): string {
  return (
    `Hola ${ctx.clientName} 👋 Te recordamos tu cita de ${ctx.serviceName}` +
    `${staffLine} en ${ctx.businessName}:\n` +
    `📅 ${when}\n\n` +
    `¿Vas a asistir? Confírmanos aquí (un toque):\n` +
    `${ctx.confirmationUrl}\n\n` +
    `Si no puedes venir, cancela desde ese mismo enlace. Recuerda: cancelar ` +
    `con menos de ${ctx.cancellationWindowHours} horas tiene un cargo del ` +
    `${ctx.lateCancellationFeePercent}% (${formatCents(
      Math.round((ctx.priceCents * ctx.lateCancellationFeePercent) / 100),
      ctx.currency,
    )}).`
  );
}

export function cancellationMessage(
  ctx: AppointmentMessageContext,
  chargedCents: number,
  overrides?: TemplateOverrides,
): { subject: string; body: string } {
  const when = formatDateTime(ctx.startAt, ctx.timezone);
  const chargeLine =
    chargedCents > 0
      ? `Por cancelación fuera de plazo se aplica un cargo de ${formatCents(chargedCents, ctx.currency)}.`
      : "La cancelación se realizó dentro de plazo: sin coste.";
  const custom = overrides?.CANCELLED;
  return {
    subject: custom?.subject
      ? renderTemplate(custom.subject, ctx)
      : `Cita cancelada en ${ctx.businessName}`,
    // El cargo depende de cada cancelación (no hay variable): con texto
    // propio, la línea del cargo se añade siempre al final.
    body: custom?.body
      ? `${renderTemplate(custom.body, ctx)}\n${chargeLine}`
      : `Hola ${ctx.clientName}, tu cita de ${ctx.serviceName} en ` +
        `${ctx.businessName} (${when}) ha quedado cancelada.\n${chargeLine}`,
  };
}

export function noShowMessage(
  ctx: AppointmentMessageContext,
  chargedCents: number,
  overrides?: TemplateOverrides,
): { subject: string; body: string } {
  const when = formatDateTime(ctx.startAt, ctx.timezone);
  const chargeLine =
    chargedCents > 0
      ? `Se ha aplicado un cargo por no presentarse de ${formatCents(chargedCents, ctx.currency)}.`
      : "No se ha aplicado ningún cargo por esta ausencia.";
  const custom = overrides?.NO_SHOW;
  return {
    subject: custom?.subject
      ? renderTemplate(custom.subject, ctx)
      : `No presentado · ${ctx.businessName}`,
    body: custom?.body
      ? `${renderTemplate(custom.body, ctx)}\n${chargeLine}`
      : `Hola ${ctx.clientName}, constas como no presentado/a en tu cita de ` +
        `${ctx.serviceName} en ${ctx.businessName} (${when}).\n${chargeLine}`,
  };
}
