import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/prisma";
import { renderBrandedEmail } from "../email-html";
import { buildAppointmentIcs } from "../ics";
import type { Channel, SendResult } from "./types";

// Email vía SMTP genérico (nodemailer): funciona con cualquier proveedor
// barato o gratuito (Brevo, Resend SMTP, Mailgun, Gmail con app password…).

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

function baseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

// Envío directo con texto + HTML (lo usan el canal del outbox y los emails de
// auth). Sin SMTP configurado, el mensaje se vuelca al log para poder probar
// el flujo en desarrollo, indicando los adjuntos que llevaría.
export async function sendEmail(message: OutgoingEmail): Promise<SendResult> {
  if (!process.env.SMTP_HOST) {
    const attachmentNote = (message.attachments ?? [])
      .map((a) => `\n[adjunto ${a.filename}]`)
      .join("");
    console.log(
      `[email:dev] ${message.subject} → ${message.to}\n${message.text}${attachmentNote}\n---`,
    );
    return { ok: true, providerRef: "dev-log" };
  }
  try {
    const info = await getTransporter().sendMail({
      from: process.env.SMTP_FROM ?? "AppCitas <no-reply@appcitas.local>",
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments,
    });
    return { ok: true, providerRef: info.messageId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Error SMTP",
    };
  }
}

// Las notificaciones BOOKING_CONFIRMED y REMINDER llevan en el cuerpo el
// enlace público /c/{confirmationToken} (ver service.ts): identifica la cita
// y permite generar el adjunto de calendario. CANCELLED no incluye enlace,
// así que nunca lleva .ics.
const CONFIRMATION_LINK = /\/c\/([a-z0-9]{12,})/i;

async function buildIcsAttachment(
  body: string,
): Promise<EmailAttachment | null> {
  const token = CONFIRMATION_LINK.exec(body)?.[1];
  if (!token) return null;
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { confirmationToken: token },
      include: { service: true, business: true, staff: true },
    });
    if (!appointment || appointment.status !== "CONFIRMED") return null;
    const url = `${baseUrl()}/c/${appointment.confirmationToken}`;
    const description = [
      `Cita de ${appointment.service.name} en ${appointment.business.name}.`,
      ...(appointment.staff
        ? [`Te atenderá: ${appointment.staff.name}.`]
        : []),
      `Gestiona tu cita: ${url}`,
    ].join("\n");
    return {
      filename: "cita.ics",
      content: buildAppointmentIcs({
        uid: `${appointment.id}@appcitas`,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        summary: `${appointment.service.name} · ${appointment.business.name}`,
        description,
        location: appointment.business.address ?? undefined,
        url,
      }),
      contentType: "text/calendar; charset=utf-8; method=PUBLISH",
    };
  } catch {
    // El adjunto es un extra: si la consulta falla, el email sale sin él.
    return null;
  }
}

export const emailChannel: Channel = {
  key: "EMAIL",

  isConfigured() {
    return !!process.env.SMTP_HOST;
  },

  async send(recipient, subject, body): Promise<SendResult> {
    const icsAttachment = await buildIcsAttachment(body);
    return sendEmail({
      to: recipient,
      subject: subject ?? "AppCitas",
      text: body,
      html: renderBrandedEmail({ title: subject ?? "AppCitas", intro: body }),
      attachments: icsAttachment ? [icsAttachment] : undefined,
    });
  },
};
