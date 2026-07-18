import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { whatsappChannel } from "../channels/whatsapp";

// Canal de WhatsApp: con la API oficial (Cloud API) configurada, gana sobre
// UltraMsg/Evolution y envía por graph.facebook.com con el token Bearer.
describe("whatsappChannel (Cloud API oficial)", () => {
  const ENV_KEYS = [
    "WHATSAPP_PROVIDER",
    "WHATSAPP_CLOUD_TOKEN",
    "WHATSAPP_CLOUD_PHONE_ID",
    "ULTRAMSG_INSTANCE_ID",
    "ULTRAMSG_TOKEN",
    "EVOLUTION_API_URL",
    "EVOLUTION_API_KEY",
    "EVOLUTION_INSTANCE",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
  });

  it("sin ningún proveedor no está configurado; con Cloud API sí", () => {
    expect(whatsappChannel.isConfigured()).toBe(false);
    process.env.WHATSAPP_CLOUD_TOKEN = "tok";
    process.env.WHATSAPP_CLOUD_PHONE_ID = "12345";
    expect(whatsappChannel.isConfigured()).toBe(true);
  });

  it("envía por la API oficial con prioridad sobre UltraMsg", async () => {
    process.env.WHATSAPP_CLOUD_TOKEN = "tok";
    process.env.WHATSAPP_CLOUD_PHONE_ID = "12345";
    process.env.ULTRAMSG_INSTANCE_ID = "u1"; // configurado, pero pierde
    process.env.ULTRAMSG_TOKEN = "u2";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ messages: [{ id: "wamid.abc" }] }),
        { status: 200 },
      ),
    );

    const result = await whatsappChannel.send("+34 600 111 222", null, "Hola");
    expect(result.ok).toBe(true);
    expect(result.providerRef).toBe("wamid.abc");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://graph.facebook.com/v20.0/12345/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok",
    );
    const body = JSON.parse(String(init.body)) as {
      to: string;
      messaging_product: string;
      text: { body: string };
    };
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("34600111222"); // teléfono normalizado
    expect(body.text.body).toBe("Hola");
  });

  it("WHATSAPP_PROVIDER=evolution fuerza esa vía aunque UltraMsg esté configurado", async () => {
    process.env.WHATSAPP_PROVIDER = "evolution";
    process.env.ULTRAMSG_INSTANCE_ID = "u1";
    process.env.ULTRAMSG_TOKEN = "u2";
    process.env.EVOLUTION_API_URL = "https://evo.local";
    process.env.EVOLUTION_API_KEY = "k";
    process.env.EVOLUTION_INSTANCE = "main";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ key: { id: "evo-1" } }), { status: 200 }),
    );

    const result = await whatsappChannel.send("+34600111222", null, "Hola");
    expect(result.ok).toBe(true);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://evo.local/message/sendText/main");
  });

  it("WHATSAPP_PROVIDER=off apaga el canal aunque haya claves", () => {
    process.env.WHATSAPP_PROVIDER = "off";
    process.env.WHATSAPP_CLOUD_TOKEN = "tok";
    process.env.WHATSAPP_CLOUD_PHONE_ID = "12345";
    expect(whatsappChannel.isConfigured()).toBe(false);
  });

  it("WHATSAPP_PROVIDER=cloud sin claves deja el canal como no configurado", () => {
    process.env.WHATSAPP_PROVIDER = "cloud";
    process.env.ULTRAMSG_INSTANCE_ID = "u1"; // presente, pero la vía forzada es cloud
    process.env.ULTRAMSG_TOKEN = "u2";
    expect(whatsappChannel.isConfigured()).toBe(false);
  });

  it("un valor desconocido de WHATSAPP_PROVIDER cae a auto (fail-open)", () => {
    process.env.WHATSAPP_PROVIDER = "paloma-mensajera";
    process.env.WHATSAPP_CLOUD_TOKEN = "tok";
    process.env.WHATSAPP_CLOUD_PHONE_ID = "12345";
    expect(whatsappChannel.isConfigured()).toBe(true);
  });

  it("con plantilla mapeada envía type=template con las variables en orden", async () => {
    process.env.WHATSAPP_CLOUD_TOKEN = "tok";
    process.env.WHATSAPP_CLOUD_PHONE_ID = "12345";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.tpl" }] }), {
        status: 200,
      }),
    );

    const vars = [
      "Marta",
      "Corte",
      "Barbería Norte",
      "12 ago 2026, 10:00",
      "https://app.local/c/tok123",
    ];
    const result = await whatsappChannel.send("+34600111222", null, "ignorado", {
      waTemplate: { name: "cita_recordatorio", lang: "es", vars },
    });
    expect(result.ok).toBe(true);
    expect(result.providerRef).toBe("wamid.tpl");

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(String(init.body)) as {
      type: string;
      template: {
        name: string;
        language: { code: string };
        components: Array<{
          type: string;
          parameters: Array<{ type: string; text: string }>;
        }>;
      };
    };
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("cita_recordatorio");
    expect(body.template.language.code).toBe("es");
    expect(body.template.components[0].parameters.map((p) => p.text)).toEqual(
      vars,
    );
  });

  it("propaga el error de Meta cuando la API rechaza", async () => {
    process.env.WHATSAPP_CLOUD_TOKEN = "tok";
    process.env.WHATSAPP_CLOUD_PHONE_ID = "12345";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "(#131030) Recipient not in allowed list" } }),
        { status: 400 },
      ),
    );
    const result = await whatsappChannel.send("+34600111222", null, "Hola");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("131030");
  });
});
