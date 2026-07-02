export interface SendResult {
  ok: boolean;
  providerRef?: string;
  error?: string;
}

export interface Channel {
  readonly key: "EMAIL" | "SMS" | "WHATSAPP";
  isConfigured(): boolean;
  send(
    recipient: string,
    subject: string | null,
    body: string,
  ): Promise<SendResult>;
}

// Normaliza un teléfono a dígitos internacionales (sin +, espacios ni guiones)
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}
