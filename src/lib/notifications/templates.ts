import { formatCents } from "@/lib/money";

// Plantillas de mensajes en texto plano: válidas para email, SMS y WhatsApp.

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

function formatDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

export function bookingConfirmedMessage(ctx: AppointmentMessageContext): {
  subject: string;
  body: string;
} {
  const when = formatDateTime(ctx.startAt, ctx.timezone);
  const staffLine = ctx.staffName ? `\nTe atenderá: ${ctx.staffName}` : "";
  return {
    subject: `Cita confirmada en ${ctx.businessName}`,
    body:
      `Hola ${ctx.clientName}, tu cita está confirmada. ✅\n\n` +
      `${ctx.serviceName} en ${ctx.businessName}\n` +
      `📅 ${when}${staffLine}\n` +
      `💶 ${formatCents(ctx.priceCents, ctx.currency)}\n\n` +
      `Puedes cancelar gratis hasta ${ctx.cancellationWindowHours} horas antes. ` +
      `Después se cobra el ${ctx.lateCancellationFeePercent}% del servicio.\n` +
      `Gestiona tu cita: ${ctx.confirmationUrl}`,
  };
}

export function reminderMessage(ctx: AppointmentMessageContext): {
  subject: string;
  body: string;
} {
  const when = formatDateTime(ctx.startAt, ctx.timezone);
  const staffLine = ctx.staffName ? ` con ${ctx.staffName}` : "";
  return {
    subject: `Recordatorio: tu cita en ${ctx.businessName}`,
    body:
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
      )}).`,
  };
}

export function cancellationMessage(
  ctx: AppointmentMessageContext,
  chargedCents: number,
): { subject: string; body: string } {
  const when = formatDateTime(ctx.startAt, ctx.timezone);
  const chargeLine =
    chargedCents > 0
      ? `Por cancelación fuera de plazo se aplica un cargo de ${formatCents(chargedCents, ctx.currency)}.`
      : "La cancelación se realizó dentro de plazo: sin coste.";
  return {
    subject: `Cita cancelada en ${ctx.businessName}`,
    body:
      `Hola ${ctx.clientName}, tu cita de ${ctx.serviceName} en ` +
      `${ctx.businessName} (${when}) ha quedado cancelada.\n${chargeLine}`,
  };
}

export function noShowMessage(
  ctx: AppointmentMessageContext,
  chargedCents: number,
): { subject: string; body: string } {
  const when = formatDateTime(ctx.startAt, ctx.timezone);
  const chargeLine =
    chargedCents > 0
      ? `Se ha aplicado un cargo por no presentarse de ${formatCents(chargedCents, ctx.currency)}.`
      : "No se ha aplicado ningún cargo por esta ausencia.";
  return {
    subject: `No presentado · ${ctx.businessName}`,
    body:
      `Hola ${ctx.clientName}, constas como no presentado/a en tu cita de ` +
      `${ctx.serviceName} en ${ctx.businessName} (${when}).\n${chargeLine}`,
  };
}
