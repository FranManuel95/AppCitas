import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { DomainError } from "@/lib/domain/errors";
import { logError } from "@/lib/logger";

// Capa fina sobre la API de Google Calendar (OAuth + events + freebusy) por
// fetch directo, sin SDK. Scopes mínimos: calendar.events + calendar.freebusy
// + openid email (el email sale del id_token, sin scope de userinfo).
//
// Sin GOOGLE_CLIENT_ID/SECRET la integración funciona en modo simulado en
// desarrollo (conexión ficticia, push al log, freebusy vacío) para poder
// recorrer el flujo completo sin proyecto de Google Cloud.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API_BASE = "https://www.googleapis.com/calendar/v3";

export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "openid",
  "email",
].join(" ");

// Techo por llamada a Google en caminos que corren dentro de un request
// (refresh de token, push de eventos): una API lenta no puede colgar la
// reserva; el try/catch del llamador convierte el timeout en fail-open.
const GOOGLE_TIMEOUT_MS = 4_000;

export function isCalendarConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export function assertCalendarSimulationAllowed(): void {
  if (process.env.NODE_ENV === "production") {
    throw new DomainError(
      "Google Calendar no está configurado en este entorno",
      "CALENDAR_NOT_CONFIGURED",
      503,
    );
  }
}

export function googleAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPES,
    access_type: "offline",
    prompt: "consent", // fuerza refresh_token también en reconexiones
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  email: string | null;
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new DomainError(
      "Google rechazó la autorización",
      "CALENDAR_OAUTH_FAILED",
      502,
    );
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    email: json.id_token ? emailFromIdToken(json.id_token) : null,
  };
}

/** Email del id_token (viene por TLS directo del endpoint de Google). */
export function emailFromIdToken(idToken: string): string | null {
  try {
    const payload = idToken.split(".")[1];
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { email?: string };
    return decoded.email ?? null;
  } catch {
    return null;
  }
}

export async function revokeTokenBestEffort(token: string): Promise<void> {
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
    });
  } catch {
    // best-effort: la conexión se borra igualmente
  }
}

/**
 * Access token vigente de una conexión: descifra y, si caduca en <60 s,
 * refresca y persiste. invalid_grant → la conexión pasa a error (el dueño
 * debe reconectar) y se lanza.
 */
export async function getAccessToken(connection: {
  id: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  accessTokenExpiresAt: Date | null;
}): Promise<string> {
  const expiresAt = connection.accessTokenExpiresAt?.getTime() ?? 0;
  if (expiresAt > Date.now() + 60_000) {
    return decryptSecret(connection.accessTokenEnc);
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: decryptSecret(connection.refreshTokenEnc),
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // invalid_grant: el usuario revocó el acceso → sin bucles de refresh
    await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: { status: "error", lastError: `refresh: ${body.slice(0, 200)}` },
    });
    throw new DomainError(
      "La conexión con Google caducó: reconecta el calendario",
      "CALENDAR_RECONNECT",
      502,
    );
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  await prisma.calendarConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEnc: encryptSecret(json.access_token),
      accessTokenExpiresAt: new Date(Date.now() + json.expires_in * 1000),
      status: "active",
      lastError: null,
    },
  });
  return json.access_token;
}

export interface BusySlot {
  start: string; // ISO
  end: string; // ISO
}

/** freebusy.query del calendario de la conexión (con timeout del llamador). */
export async function freeBusyQuery(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
  signal?: AbortSignal,
): Promise<BusySlot[]> {
  const res = await fetch(`${API_BASE}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`freebusy ${res.status}`);
  }
  const json = (await res.json()) as {
    calendars?: Record<string, { busy?: BusySlot[] }>;
  };
  return json.calendars?.[calendarId]?.busy ?? [];
}

export interface CalendarEventPayload {
  summary: string;
  description?: string;
  location?: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
}

function eventBody(payload: CalendarEventPayload) {
  return {
    summary: payload.summary,
    description: payload.description,
    location: payload.location,
    start: {
      dateTime: payload.startAt.toISOString(),
      timeZone: payload.timezone,
    },
    end: { dateTime: payload.endAt.toISOString(), timeZone: payload.timezone },
  };
}

/** Crea o actualiza el evento; devuelve su id. PATCH 404 → se recrea. */
export async function upsertEvent(
  accessToken: string,
  calendarId: string,
  existingEventId: string | null,
  payload: CalendarEventPayload,
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  if (existingEventId) {
    const res = await fetch(
      `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEventId)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify(eventBody(payload)),
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      },
    );
    if (res.ok) {
      const json = (await res.json()) as { id: string };
      return json.id;
    }
    if (res.status !== 404 && res.status !== 410) {
      throw new Error(`event patch ${res.status}`);
    }
    // El evento se borró en Google: se recrea abajo
  }
  const res = await fetch(
    `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(eventBody(payload)),
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`event insert ${res.status}`);
  const json = (await res.json()) as { id: string };
  return json.id;
}

/** Borra el evento (404/410 = ya no existe, se considera éxito). */
export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`event delete ${res.status}`);
  }
}

/** Borra una conexión revocando el token best-effort. */
export async function disconnectCalendar(connectionId: string): Promise<void> {
  const connection = await prisma.calendarConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection) return;
  if (!connection.simulated && isCalendarConfigured()) {
    try {
      await revokeTokenBestEffort(decryptSecret(connection.refreshTokenEnc));
    } catch (error) {
      logError("calendar.revoke.failed", error, { connectionId });
    }
  }
  // Cascade borra links, jobs y caché
  await prisma.calendarConnection.delete({ where: { id: connectionId } });
}
