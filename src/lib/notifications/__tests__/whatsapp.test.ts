import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { whatsappChannel } from "../channels/whatsapp";

// Canal de WhatsApp: con la API oficial (Cloud API) configurada, gana sobre
// UltraMsg/Evolution y envía por graph.facebook.com con el token Bearer.
describe("whatsappChannel (Cloud API oficial)", () => {
  const ENV_KEYS = [
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
