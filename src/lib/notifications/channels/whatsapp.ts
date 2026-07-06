import { normalizePhone, type Channel, type SendResult } from "./types";

// WhatsApp con tres adaptadores, por orden de preferencia:
//
// 0. API OFICIAL de WhatsApp Business (Meta Cloud API) — la vía sin riesgo de
//    baneo y la única apta para volumen. Vars: WHATSAPP_CLOUD_TOKEN,
//    WHATSAPP_CLOUD_PHONE_ID (el phone_number_id del número en Meta).
//    Nota: fuera de la ventana de 24 h de atención, Meta exige PLANTILLAS
//    aprobadas para mensajes iniciados por el negocio; el texto libre de este
//    canal cubre recordatorios dentro de la ventana y respuestas. Para
//    plantillas, configúralas en el panel de Meta y amplía sendViaCloudApi.
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
// Con varios configurados gana el de número más bajo (oficial primero).
// Aviso: UltraMsg/Evolution usan WhatsApp Web por detrás (riesgo de baneo);
// conviene un número dedicado y migrar a la API oficial cuanto antes.

const GRAPH_BASE = "https://graph.facebook.com/v20.0";

function cloudApiConfigured(): boolean {
  return (
    !!process.env.WHATSAPP_CLOUD_TOKEN && !!process.env.WHATSAPP_CLOUD_PHONE_ID
  );
}

async function sendViaCloudApi(to: string, body: string): Promise<SendResult> {
  const phoneId = process.env.WHATSAPP_CLOUD_PHONE_ID!;
  try {
    const res = await fetch(`${GRAPH_BASE}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        error: json.error?.message ?? `Cloud API HTTP ${res.status}`,
      };
    }
    return { ok: true, providerRef: json.messages?.[0]?.id };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Error de red (Cloud API)",
    };
  }
}

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
    return cloudApiConfigured() || ultramsg || evolution;
  },

  async send(recipient, _subject, body): Promise<SendResult> {
    const to = normalizePhone(recipient);
    if (cloudApiConfigured()) {
      return sendViaCloudApi(to, body);
    }
    if (process.env.ULTRAMSG_INSTANCE_ID && process.env.ULTRAMSG_TOKEN) {
      return sendViaUltraMsg(to, body);
    }
    return sendViaEvolution(to, body);
  },
};
