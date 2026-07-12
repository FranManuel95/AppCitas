import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import type { Channel, SendResult } from "./types";

// Push web (PWA): canal GRATUITO. El "recipient" de la fila del outbox es el
// userId del cliente; aquí se resuelven sus suscripciones (una por
// dispositivo) y se envía a todas. Requiere claves VAPID en el entorno:
//   npx web-push generate-vapid-keys
// Sin claves, el canal queda sin configurar (los envíos se marcan SKIPPED).

function configured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
}

let vapidReady = false;
function ensureVapid(): void {
  if (vapidReady) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:soporte@appcitas.local",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidReady = true;
}

export const webPushChannel: Channel = {
  key: "WEBPUSH",
  isConfigured: configured,

  async send(
    recipient: string,
    subject: string | null,
    body: string,
  ): Promise<SendResult> {
    ensureVapid();
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: recipient },
    });
    // El usuario desactivó los avisos después de encolarse: nada que hacer
    if (subscriptions.length === 0) {
      return { ok: true, providerRef: "sin-suscripciones" };
    }

    const payload = JSON.stringify({
      title: subject ?? "AppCitas",
      body,
      url: "/mis-citas",
    });

    let delivered = 0;
    let lastError = "";
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: 24 * 3600 },
        );
        delivered++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404/410: la suscripción ya no existe (app desinstalada, permiso
        // revocado) → se limpia para no reintentar eternamente
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        } else {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }
    }

    if (delivered > 0) {
      return { ok: true, providerRef: `webpush:${delivered}` };
    }
    return lastError
      ? { ok: false, error: lastError }
      : { ok: true, providerRef: "suscripciones-caducadas" };
  },
};
