import { createHmac, timingSafeEqual } from "crypto";

// Token de baja de comunicaciones comerciales, firmado y SIN estado:
// `userId.HMAC(AUTH_SECRET, "unsub:"+userId)`. No caduca (una baja debe
// funcionar meses después del email); se revoca solo rotando AUTH_SECRET.

function secret(): string {
  return process.env.AUTH_SECRET ?? "appcitas-dev-secret-no-usar-en-produccion";
}

function signature(userId: string): string {
  return createHmac("sha256", secret()).update(`unsub:${userId}`).digest("hex");
}

export function unsubscribeToken(userId: string): string {
  return `${userId}.${signature(userId)}`;
}

/** userId si la firma es válida; null en cualquier otro caso. */
export function verifyUnsubscribeToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = signature(userId);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? userId : null;
}
