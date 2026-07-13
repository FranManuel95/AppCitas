import { randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { baseUrl } from "./oauth";
import {
  getAccessToken,
  isCalendarConfigured,
  stopChannel,
  watchEvents,
} from "./google";

// Watch channels de Google Calendar: push de cambios que invalida la caché
// de freebusy al momento, en vez de esperar a que caduque. Es una MEJORA,
// nunca un requisito: exige HTTPS público y el dominio verificado en Google
// Search Console; sin eso, todo sigue funcionando con la caché de 60 s.
// Todos los caminos son fail-open (un fallo jamás rompe reserva ni conexión).

const RENEW_WINDOW_MS = 24 * 3_600_000; // renovar canales que caducan en <24 h
const RENEW_BATCH = 10;

/** Dirección pública del webhook, o null si el entorno no puede recibir push. */
function webhookAddress(): string | null {
  const base = baseUrl();
  if (!base.startsWith("https://")) return null; // Google exige HTTPS
  return `${base}/api/calendar/google/webhook`;
}

/**
 * Abre (o rota) el canal watch de una conexión real activa. No-op en modo
 * simulado, sin claves de Google o sin base HTTPS. El canal viejo se para
 * DESPUÉS de crear el nuevo para no dejar huecos sin push.
 */
export async function ensureWatchForConnection(
  connectionId: string,
): Promise<void> {
  try {
    if (!isCalendarConfigured()) return;
    const address = webhookAddress();
    if (!address) return;

    const connection = await prisma.calendarConnection.findUnique({
      where: { id: connectionId },
    });
    if (
      !connection ||
      connection.simulated ||
      connection.status !== "active" ||
      !connection.syncInbound
    ) {
      return;
    }

    const accessToken = await getAccessToken(connection);
    const channelId = randomUUID();
    const watchToken = randomBytes(24).toString("base64url");
    const result = await watchEvents(accessToken, connection.calendarId, {
      channelId,
      token: watchToken,
      address,
    });

    await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: {
        watchChannelId: channelId,
        watchResourceId: result.resourceId,
        watchExpiresAt: result.expiration,
        watchToken,
      },
    });

    if (connection.watchChannelId && connection.watchResourceId) {
      try {
        await stopChannel(
          accessToken,
          connection.watchChannelId,
          connection.watchResourceId,
        );
      } catch {
        // best-effort: el canal viejo caduca solo
      }
    }
  } catch (error) {
    logError("calendar.watch.failed", error, { connectionId });
  }
}

/**
 * Renueva los canales que caducan en <24 h y crea los que falten (conexiones
 * cuyo alta de watch falló en su día). La invoca el cron. Devuelve cuántas
 * conexiones intentó.
 */
export async function renewExpiringWatchChannels(
  now = new Date(),
): Promise<number> {
  if (!isCalendarConfigured() || !webhookAddress()) return 0;
  const due = await prisma.calendarConnection.findMany({
    where: {
      simulated: false,
      status: "active",
      syncInbound: true,
      OR: [
        { watchChannelId: null },
        { watchExpiresAt: { lt: new Date(now.getTime() + RENEW_WINDOW_MS) } },
      ],
    },
    select: { id: true },
    take: RENEW_BATCH,
  });
  for (const { id } of due) {
    await ensureWatchForConnection(id);
  }
  return due.length;
}

export type WatchNotificationResult = "invalidated" | "ignored";

/**
 * Notificación push del webhook. La autenticidad la da el par opaco
 * (channelId, token) del canal; con token válido se invalida la caché de
 * freebusy de la conexión (la próxima disponibilidad refetchea en vivo).
 */
export async function handleWatchNotification(params: {
  channelId: string | null;
  token: string | null;
  state: string | null;
}): Promise<WatchNotificationResult> {
  const { channelId, token, state } = params;
  if (!channelId || !token) return "ignored";
  // El "sync" inicial solo confirma el alta del canal: nada que invalidar
  if (state === "sync") return "ignored";

  const connection = await prisma.calendarConnection.findFirst({
    where: { watchChannelId: channelId },
    select: { id: true, watchToken: true },
  });
  if (!connection?.watchToken) return "ignored";
  if (!tokensMatch(connection.watchToken, token)) return "ignored";

  await prisma.calendarBusyCache.deleteMany({
    where: { connectionId: connection.id },
  });
  return "invalidated";
}

function tokensMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
