import { normalizePhone, type Channel, type SendResult } from "./types";

// WhatsApp SIN la API oficial de WhatsApp Business, con dos adaptadores:
//
// 1. UltraMsg (hosted, setup en minutos): se escanea un QR en su panel y se
//    obtiene instancia + token. Coste bajo y sin infraestructura propia.
//    Vars: ULTRAMSG_INSTANCE_ID, ULTRAMSG_TOKEN
//
// 2. Evolution API (autoalojado, GRATIS): wrapper REST sobre Baileys
//    (WhatsApp Web). Un contenedor Docker en cualquier VPS. La opción más
//    barata: 0 € de licencia. https://github.com/EvolutionAPI/evolution-api
//    Vars: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE
//
// Si ambos están configurados, se usa UltraMsg. Aviso: estas vías usan
// WhatsApp Web por detrás; conviene un número dedicado del negocio.

async function sendViaUltraMsg(to: string, body: string): Promise<SendResult> {
  const instance = process.env.ULTRAMSG_INSTANCE_ID!;
  try {
    const res = await fetch(
      `https://api.ultramsg.com/${instance}/messages/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: process.env.ULTRAMSG_TOKEN!,
          to,
          body,
        }),
      },
    );
    const json = (await res.json()) as {
      sent?: string | boolean;
      id?: number | string;
      error?: unknown;
    };
    const sent = json.sent === true || json.sent === "true";
    if (!res.ok || !sent) {
      return {
        ok: false,
        error: json.error ? JSON.stringify(json.error) : `UltraMsg HTTP ${res.status}`,
      };
    }
    return { ok: true, providerRef: String(json.id ?? "") };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Error de red (UltraMsg)",
    };
  }
}

async function sendViaEvolution(to: string, body: string): Promise<SendResult> {
  const base = process.env.EVOLUTION_API_URL!.replace(/\/$/, "");
  const instance = process.env.EVOLUTION_INSTANCE!;
  try {
    const res = await fetch(`${base}/message/sendText/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.EVOLUTION_API_KEY!,
      },
      body: JSON.stringify({ number: to, text: body }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      key?: { id?: string };
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: json.message ?? `Evolution API HTTP ${res.status}`,
      };
    }
    return { ok: true, providerRef: json.key?.id };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Error de red (Evolution)",
    };
  }
}

export const whatsappChannel: Channel = {
  key: "WHATSAPP",

  isConfigured() {
    const ultramsg =
      !!process.env.ULTRAMSG_INSTANCE_ID && !!process.env.ULTRAMSG_TOKEN;
    const evolution =
      !!process.env.EVOLUTION_API_URL &&
      !!process.env.EVOLUTION_API_KEY &&
      !!process.env.EVOLUTION_INSTANCE;
    return ultramsg || evolution;
  },

  async send(recipient, _subject, body): Promise<SendResult> {
    const to = normalizePhone(recipient);
    if (process.env.ULTRAMSG_INSTANCE_ID && process.env.ULTRAMSG_TOKEN) {
      return sendViaUltraMsg(to, body);
    }
    return sendViaEvolution(to, body);
  },
};
