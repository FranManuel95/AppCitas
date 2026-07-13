import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { freeBusyQuery, getAccessToken, type BusySlot } from "./google";

// Sincronización ENTRANTE: el "ocupado" del calendario personal bloquea
// huecos. freebusy.query EN VIVO al consultar disponibilidad, con caché
// compartida de 60 s (CalendarBusyCache) y timeout corto. FAIL-OPEN: un
// error o timeout de Google devuelve "sin ocupación" y la reserva sigue —
// mejor un posible solape externo que no poder reservar.

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 2500;
const ERROR_THRESHOLD = 5;

export interface ExternalBusy {
  // key: staffId de la conexión, o "business" para la de nivel negocio
  byStaff: Map<string, Array<{ startAt: Date; endAt: Date }>>;
  businessLevel: Array<{ startAt: Date; endAt: Date }>;
}

/**
 * Intervalos ocupados externos de las conexiones entrantes del negocio para
 * un día. Barato cuando no hay conexiones (una consulta indexada).
 */
export async function getExternalBusy(params: {
  businessId: string;
  dateISO: string;
  dayStart: Date;
  dayEnd: Date;
  now?: Date;
}): Promise<ExternalBusy> {
  const empty: ExternalBusy = { byStaff: new Map(), businessLevel: [] };
  const now = params.now ?? new Date();
  try {
    const connections = await prisma.calendarConnection.findMany({
      where: {
        businessId: params.businessId,
        syncInbound: true,
        status: "active",
      },
    });
    if (connections.length === 0) return empty;

    const results = await Promise.all(
      connections.map(async (connection) => {
        const busy = await busyForConnection(connection, params, now);
        return { connection, busy };
      }),
    );

    const out: ExternalBusy = { byStaff: new Map(), businessLevel: [] };
    for (const { connection, busy } of results) {
      const intervals = busy.map((b) => ({
        startAt: new Date(b.start),
        endAt: new Date(b.end),
      }));
      if (intervals.length === 0) continue;
      if (connection.staffId) {
        out.byStaff.set(connection.staffId, intervals);
      } else {
        out.businessLevel.push(...intervals);
      }
    }
    return out;
  } catch (error) {
    logError("calendar.freebusy.failed", error, {
      businessId: params.businessId,
    });
    return empty; // fail-open
  }
}

async function busyForConnection(
  connection: {
    id: string;
    calendarId: string;
    simulated: boolean;
    accessTokenEnc: string;
    refreshTokenEnc: string;
    accessTokenExpiresAt: Date | null;
  },
  params: { dateISO: string; dayStart: Date; dayEnd: Date },
  now: Date,
): Promise<BusySlot[]> {
  // Caché compartida (60 s) por conexión y día
  const cached = await prisma.calendarBusyCache.findUnique({
    where: {
      connectionId_dateISO: {
        connectionId: connection.id,
        dateISO: params.dateISO,
      },
    },
  });
  if (cached && now.getTime() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    try {
      return JSON.parse(cached.busyJson) as BusySlot[];
    } catch {
      return [];
    }
  }

  // Conexión simulada (dev): sin ocupación externa; se cachea igualmente
  let busy: BusySlot[] = [];
  if (!connection.simulated) {
    try {
      const token = await getAccessToken(connection);
      busy = await freeBusyQuery(
        token,
        connection.calendarId,
        params.dayStart,
        params.dayEnd,
        AbortSignal.timeout(FETCH_TIMEOUT_MS),
      );
      await prisma.calendarConnection.update({
        where: { id: connection.id },
        data: { lastError: null },
      });
    } catch (error) {
      // Fail-open + contador de fallos: tras varios seguidos, la conexión
      // pasa a error y deja de consultarse hasta que el dueño reconecte.
      logError("calendar.freebusy.connection", error, {
        connectionId: connection.id,
      });
      await registerFailure(connection.id);
      return cached ? (JSON.parse(cached.busyJson) as BusySlot[]) : [];
    }
  }

  await prisma.calendarBusyCache.upsert({
    where: {
      connectionId_dateISO: {
        connectionId: connection.id,
        dateISO: params.dateISO,
      },
    },
    create: {
      connectionId: connection.id,
      dateISO: params.dateISO,
      busyJson: JSON.stringify(busy),
      fetchedAt: now,
    },
    update: { busyJson: JSON.stringify(busy), fetchedAt: now },
  });
  return busy;
}

async function registerFailure(connectionId: string): Promise<void> {
  try {
    const connection = await prisma.calendarConnection.findUnique({
      where: { id: connectionId },
      select: { lastError: true },
    });
    const failures = Number(connection?.lastError?.match(/^fallos:(\d+)/)?.[1] ?? 0) + 1;
    await prisma.calendarConnection.update({
      where: { id: connectionId },
      data:
        failures >= ERROR_THRESHOLD
          ? { status: "error", lastError: `fallos:${failures} (freebusy)` }
          : { lastError: `fallos:${failures}` },
    });
  } catch {
    // el registro de fallos nunca debe romper la disponibilidad
  }
}

/** Purga de la caché de freebusy (cron): entradas de días ya pasados. */
export async function purgeBusyCache(now = new Date()): Promise<number> {
  const todayISO = now.toISOString().slice(0, 10);
  const result = await prisma.calendarBusyCache.deleteMany({
    where: { dateISO: { lt: todayISO } },
  });
  return result.count;
}
