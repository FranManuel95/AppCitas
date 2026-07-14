export interface SendResult {
  ok: boolean;
  providerRef?: string;
  error?: string;
}

// Techo por llamada HTTP a un proveedor externo (WhatsApp/SMS/SMTP): un
// proveedor colgado no puede bloquear el drenaje del outbox; el fallo se
// reintenta desde el cron como cualquier otro error de envío.
export const CHANNEL_TIMEOUT_MS = 8_000;

// Contexto del negocio remitente. El canal de email lo usa para que el correo
// salga con el NOMBRE del negocio como remitente y su email como Reply-To
// (el dominio de envío sigue siendo el verificado de la plataforma, por
// entregabilidad). SMS/WhatsApp lo ignoran.
export interface SendOptions {
  fromName?: string | null;
  replyTo?: string | null;
}

export interface Channel {
  readonly key: "EMAIL" | "SMS" | "WHATSAPP" | "WEBPUSH";
  isConfigured(): boolean;
  send(
    recipient: string,
    subject: string | null,
    body: string,
    options?: SendOptions,
  ): Promise<SendResult>;
}

// Normaliza un teléfono a dígitos internacionales (sin +, espacios ni guiones)
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}
