import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { getExternalBusy } from "@/lib/calendar/freebusy";
import {
  handleWatchNotification,
  renewExpiringWatchChannels,
} from "@/lib/calendar/watch";
import { resetDb, seedBusiness } from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");

// Watch channels: push de Google → invalidar caché de freebusy. Todo sin red:
// las llamadas a Google se stubbean por URL.
async function seedRealConnection(
  businessId: string,
  extra: Record<string, unknown> = {},
) {
  return prisma.calendarConnection.create({
    data: {
      businessId,
      staffId: null,
      googleEmail: "dueno@test.local",
      accessTokenEnc: encryptSecret("access-token-vigente"),
      refreshTokenEnc: encryptSecret("refresh-token"),
      // Token vigente MUY lejos en el futuro: getAccessToken compara contra
      // el reloj real, no contra NOW; así nunca intenta refrescar (cero red)
      accessTokenExpiresAt: new Date("2036-01-01T00:00:00.000Z"),
      simulated: false,
      status: "active",
      ...extra,
    },
  });
}

async function seedCache(connectionId: string, fetchedAt: Date) {
  await prisma.calendarBusyCache.create({
    data: {
      connectionId,
      dateISO: "2026-07-20",
      busyJson: JSON.stringify([
        { start: "2026-07-20T10:00:00.000Z", end: "2026-07-20T11:00:00.000Z" },
      ]),
      fetchedAt,
    },
  });
}

describe("handleWatchNotification (BD)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("token válido invalida la caché; inválido/desconocido/sync no", async () => {
    const { businessId } = await seedBusiness();
    const connection = await seedRealConnection(businessId, {
      watchChannelId: "chan-1",
      watchResourceId: "res-1",
      watchToken: "tok-secreto",
      watchExpiresAt: new Date(NOW.getTime() + 86_400_000),
    });
    await seedCache(connection.id, NOW);

    // Canal desconocido → ignorada, la caché sigue
    expect(
      await handleWatchNotification({
        channelId: "chan-otro",
        token: "tok-secreto",
        state: "exists",
      }),
    ).toBe("ignored");
    // Token incorrecto → ignorada
    expect(
      await handleWatchNotification({
        channelId: "chan-1",
        token: "tok-malo",
        state: "exists",
      }),
    ).toBe("ignored");
    // El "sync" inicial del alta no invalida nada
    expect(
      await handleWatchNotification({
        channelId: "chan-1",
        token: "tok-secreto",
        state: "sync",
      }),
    ).toBe("ignored");
    expect(await prisma.calendarBusyCache.count()).toBe(1);

    // Notificación auténtica → borra la caché de ESA conexión
    expect(
      await handleWatchNotification({
        channelId: "chan-1",
        token: "tok-secreto",
        state: "exists",
      }),
    ).toBe("invalidated");
    expect(await prisma.calendarBusyCache.count()).toBe(0);
  });
});

describe("renewExpiringWatchChannels (BD, fetch stubbeado)", () => {
  let fetchCalls: Array<{ url: string; body: string }>;

  beforeEach(async () => {
    await resetDb();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("APP_BASE_URL", "https://app.test");

    fetchCalls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const target = String(url);
        fetchCalls.push({ url: target, body: String(init?.body ?? "") });
        if (target.includes("/events/watch")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              resourceId: "res-nuevo",
              expiration: String(NOW.getTime() + 7 * 86_400_000),
            }),
            text: async () => "",
          };
        }
        if (target.includes("/channels/stop")) {
          return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
        }
        throw new Error(`fetch inesperado en test: ${target}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rota el canal que caduca, crea el que falta y no toca la simulada", async () => {
    const { businessId } = await seedBusiness();
    // Caduca en <24 h → rotar (y parar el canal viejo)
    const expiring = await seedRealConnection(businessId, {
      watchChannelId: "chan-viejo",
      watchResourceId: "res-viejo",
      watchToken: "tok-viejo",
      watchExpiresAt: new Date(NOW.getTime() + 3_600_000),
    });
    // Sin canal (el alta falló en su día) → crearlo
    const other = await seedBusiness();
    const missing = await seedRealConnection(other.businessId);
    // Simulada → ni una llamada de red
    await prisma.calendarConnection.create({
      data: {
        businessId,
        staffId: null,
        googleEmail: "calendario@simulado.dev",
        accessTokenEnc: encryptSecret("dev"),
        refreshTokenEnc: encryptSecret("dev"),
        simulated: true,
        status: "active",
      },
    });

    const attempted = await renewExpiringWatchChannels(NOW);
    expect(attempted).toBe(2);

    const rotated = await prisma.calendarConnection.findUniqueOrThrow({
      where: { id: expiring.id },
    });
    expect(rotated.watchChannelId).not.toBe("chan-viejo");
    expect(rotated.watchResourceId).toBe("res-nuevo");
    expect(rotated.watchToken).not.toBe("tok-viejo");
    expect(rotated.watchExpiresAt?.getTime()).toBe(
      NOW.getTime() + 7 * 86_400_000,
    );

    const created = await prisma.calendarConnection.findUniqueOrThrow({
      where: { id: missing.id },
    });
    expect(created.watchChannelId).not.toBeNull();
    expect(created.watchResourceId).toBe("res-nuevo");

    // 2 altas de canal + 1 stop del canal viejo; la simulada no genera red
    const watchCalls = fetchCalls.filter((c) => c.url.includes("/events/watch"));
    const stopCalls = fetchCalls.filter((c) => c.url.includes("/channels/stop"));
    expect(watchCalls).toHaveLength(2);
    expect(stopCalls).toHaveLength(1);
    expect(JSON.parse(stopCalls[0].body)).toEqual({
      id: "chan-viejo",
      resourceId: "res-viejo",
    });
    // La dirección del webhook sale de APP_BASE_URL (https)
    expect(JSON.parse(watchCalls[0].body).address).toBe(
      "https://app.test/api/calendar/google/webhook",
    );
  });

  it("sin base HTTPS no se intenta nada", async () => {
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    const { businessId } = await seedBusiness();
    await seedRealConnection(businessId);
    expect(await renewExpiringWatchChannels(NOW)).toBe(0);
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("TTL adaptativo de la caché de freebusy (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const target = String(url);
        if (target.includes("/freeBusy")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              calendars: {
                primary: {
                  busy: [
                    {
                      start: "2026-07-20T14:00:00.000Z",
                      end: "2026-07-20T15:00:00.000Z",
                    },
                  ],
                },
              },
            }),
            text: async () => "",
          };
        }
        throw new Error(`fetch inesperado en test: ${target}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const dayParams = {
    dateISO: "2026-07-20",
    dayStart: new Date("2026-07-20T00:00:00.000Z"),
    dayEnd: new Date("2026-07-21T00:00:00.000Z"),
    now: NOW,
  };

  it("con watch vigente la caché de 3 min se sirve; sin watch se refetchea", async () => {
    // Con watch: la caché vive 5 min → se sirve el valor cacheado (10-11)
    const a = await seedBusiness();
    const watched = await seedRealConnection(a.businessId, {
      watchChannelId: "chan-a",
      watchExpiresAt: new Date(NOW.getTime() + 86_400_000),
    });
    await seedCache(watched.id, new Date(NOW.getTime() - 3 * 60_000));

    const cachedResult = await getExternalBusy({
      businessId: a.businessId,
      ...dayParams,
    });
    expect(cachedResult.businessLevel).toEqual([
      {
        startAt: new Date("2026-07-20T10:00:00.000Z"),
        endAt: new Date("2026-07-20T11:00:00.000Z"),
      },
    ]);
    expect(vi.mocked(fetch).mock.calls).toHaveLength(0);

    // Sin watch: a los 3 min la caché está caducada → refetch en vivo (14-15)
    const b = await seedBusiness();
    const unwatched = await seedRealConnection(b.businessId);
    await seedCache(unwatched.id, new Date(NOW.getTime() - 3 * 60_000));

    const liveResult = await getExternalBusy({
      businessId: b.businessId,
      ...dayParams,
    });
    expect(liveResult.businessLevel).toEqual([
      {
        startAt: new Date("2026-07-20T14:00:00.000Z"),
        endAt: new Date("2026-07-20T15:00:00.000Z"),
      },
    ]);
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0);
  });
});
