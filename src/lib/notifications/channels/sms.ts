import {
  CHANNEL_TIMEOUT_MS,
  normalizePhone,
  type Channel,
  type SendResult,
} from "./types";

// SMS vía API REST de Twilio (sin SDK: una llamada HTTP con basic auth).

export const smsChannel: Channel = {
  key: "SMS",

  isConfigured() {
    return (
      !!process.env.TWILIO_ACCOUNT_SID &&
      !!process.env.TWILIO_AUTH_TOKEN &&
      !!process.env.TWILIO_FROM
    );
  },

  async send(recipient, _subject, body): Promise<SendResult> {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const auth = Buffer.from(
      `${sid}:${process.env.TWILIO_AUTH_TOKEN}`,
    ).toString("base64");

    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: `+${normalizePhone(recipient)}`,
            From: process.env.TWILIO_FROM!,
            Body: body,
          }),
          signal: AbortSignal.timeout(CHANNEL_TIMEOUT_MS),
        },
      );
      const json = (await res.json()) as { sid?: string; message?: string };
      if (!res.ok) {
        return { ok: false, error: json.message ?? `Twilio HTTP ${res.status}` };
      }
      return { ok: true, providerRef: json.sid };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Error de red (Twilio)",
      };
    }
  },
};
