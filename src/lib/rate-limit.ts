import { DomainError } from "@/lib/domain/errors";

// Limitador de peticiones con ventana FIJA y contador compartido en la base
// de datos: a diferencia de un Map en memoria, protege igual con una
// instancia (SQLite en dev) que con N réplicas serverless (Postgres en
// producción). El almacén es inyectable para poder testear la lógica pura.

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitStore {
  /** Incrementa atómicamente el contador de (key, windowStart) y lo devuelve. */
  increment(key: string, windowStart: number): Promise<number>;
}

/** Almacén en memoria de proceso: tests y fallback explícito. */
export class MemoryRateLimitStore implements RateLimitStore {
  private counters = new Map<string, number>();

  async increment(key: string, windowStart: number): Promise<number> {
    const k = `${key}:${windowStart}`;
    const next = (this.counters.get(k) ?? 0) + 1;
    this.counters.set(k, next);
    return next;
  }

  clear(): void {
    this.counters.clear();
  }
}

/**
 * Almacén en la base de datos: un upsert atómico por petición
 * (INSERT … ON CONFLICT … +1). Compatible con SQLite y PostgreSQL,
 * cada uno con su sintaxis de parámetros.
 */
class DbRateLimitStore implements RateLimitStore {
  async increment(key: string, windowStart: number): Promise<number> {
    const { prisma } = await import("@/lib/prisma");
    const isPostgres = (process.env.DATABASE_URL ?? "").startsWith("postgres");
    const sql = isPostgres
      ? `INSERT INTO "RateLimitCounter" ("key", "windowStart", "count") VALUES ($1, $2, 1)
         ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitCounter"."count" + 1
         RETURNING "count"`
      : `INSERT INTO "RateLimitCounter" ("key", "windowStart", "count") VALUES (?, ?, 1)
         ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitCounter"."count" + 1
         RETURNING "count"`;
    const rows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint }>>(
      sql,
      key,
      BigInt(windowStart),
    );
    return Number(rows[0]?.count ?? 1);
  }
}

const defaultStore: RateLimitStore = new DbRateLimitStore();

export async function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  now = Date.now(),
  store: RateLimitStore = defaultStore,
): Promise<RateLimitResult> {
  const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
  const count = await store.increment(key, windowStart);

  if (count > rule.limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((windowStart + rule.windowMs - now) / 1000),
      ),
    };
  }
  return { ok: true, remaining: rule.limit - count, retryAfterSeconds: 0 };
}

// IP del cliente detrás de un proxy/inversores habituales
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

// Lanza DomainError 429 si se supera el límite (el apiHandler la serializa).
export async function enforceRateLimit(
  request: Request,
  scope: string,
  rule: RateLimitRule,
  extraKey = "",
): Promise<void> {
  const key = `${scope}:${clientIp(request)}${extraKey ? `:${extraKey}` : ""}`;
  const result = await checkRateLimit(key, rule);
  if (!result.ok) {
    throw new DomainError(
      `Demasiados intentos. Vuelve a intentarlo en ${result.retryAfterSeconds} segundos.`,
      "RATE_LIMITED",
      429,
    );
  }
}

/**
 * Borra ventanas antiguas (más de 24 h) para que la tabla no crezca sin
 * límite. Se invoca desde el job de notificaciones; si falla no rompe nada.
 */
export async function cleanupRateLimitCounters(now = Date.now()): Promise<void> {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.rateLimitCounter.deleteMany({
      where: { windowStart: { lt: BigInt(now - 24 * 60 * 60_000) } },
    });
  } catch {
    // La limpieza es oportunista: un fallo aquí no debe tumbar el cron.
  }
}
