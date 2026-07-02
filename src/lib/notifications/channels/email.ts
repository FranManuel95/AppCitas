import nodemailer, { type Transporter } from "nodemailer";
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

export const emailChannel: Channel = {
  key: "EMAIL",

  isConfigured() {
    return !!process.env.SMTP_HOST;
  },

  async send(recipient, subject, body): Promise<SendResult> {
    try {
      const info = await getTransporter().sendMail({
        from: process.env.SMTP_FROM ?? "AppCitas <no-reply@appcitas.local>",
        to: recipient,
        subject: subject ?? "AppCitas",
        text: body,
      });
      return { ok: true, providerRef: info.messageId };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Error SMTP",
      };
    }
  },
};
