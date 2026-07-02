import { DomainError } from "@/lib/domain/errors";

// Limitador de peticiones con ventana deslizante, en memoria de proceso.
// Suficiente para una instancia (el caso de este proyecto base); con varias
// réplicas debe sustituirse por un almacén compartido (Redis) manteniendo
// esta misma interfaz.

const buckets = new Map<string, number[]>();
let lastSweep = 0;

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  now = Date.now(),
): RateLimitResult {
  // Barrido perezoso de claves antiguas para no crecer sin límite
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, hits] of buckets) {
      if (hits.length === 0 || hits[hits.length - 1] < now - 3_600_000) {
        buckets.delete(k);
      }
    }
  }

  const windowStart = now - rule.windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > windowStart);

  if (hits.length >= rule.limit) {
    buckets.set(key, hits);
    const oldest = hits[0];
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((oldest + rule.windowMs - now) / 1000),
      ),
    };
  }

  hits.push(now);
  buckets.set(key, hits);
  return {
    ok: true,
    remaining: rule.limit - hits.length,
    retryAfterSeconds: 0,
  };
}

// IP del cliente detrás de un proxy/inversores habituales
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

// Lanza DomainError 429 si se supera el límite (el apiHandler la serializa).
export function enforceRateLimit(
  request: Request,
  scope: string,
  rule: RateLimitRule,
  extraKey = "",
): void {
  const key = `${scope}:${clientIp(request)}${extraKey ? `:${extraKey}` : ""}`;
  const result = checkRateLimit(key, rule);
  if (!result.ok) {
    throw new DomainError(
      `Demasiados intentos. Vuelve a intentarlo en ${result.retryAfterSeconds} segundos.`,
      "RATE_LIMITED",
      429,
    );
  }
}

// Solo para tests
export function resetRateLimiter(): void {
  buckets.clear();
  lastSweep = 0;
}
