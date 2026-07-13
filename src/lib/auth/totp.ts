import { createHash, randomBytes } from "node:crypto";
import { authenticator } from "otplib";

// 2FA TOTP (RFC 6238) con otplib: los códigos de 6 dígitos de Google
// Authenticator, 1Password, Authy, etc. Ventana de ±1 paso (30 s) para
// tolerar relojes ligeramente desincronizados.
authenticator.options = { window: 1 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpKeyUri(email: string, secret: string): string {
  return authenticator.keyuri(email, "AppCitas", secret);
}

export function verifyTotpCode(code: string, secret: string): boolean {
  const token = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) return false;
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

// ── Códigos de recuperación ──────────────────────────────────────────────────
// La salida de emergencia si se pierde el dispositivo: 8 códigos de un solo
// uso con formato XXXX-XXXX (alfabeto sin caracteres ambiguos). Se almacenan
// SOLO sus hashes SHA-256; el usuario los ve una única vez al activar el 2FA.

const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin I/L/O/0/1
const RECOVERY_COUNT = 8;

function randomRecoveryCode(): string {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export function hashRecoveryCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return createHash("sha256").update(normalized).digest("hex");
}

/** ¿Tiene pinta de código de recuperación (y no de TOTP de 6 dígitos)? */
export function looksLikeRecoveryCode(code: string): boolean {
  return /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(code.trim()) && !/^\d{6}$/.test(code.trim());
}

export function generateRecoveryCodes(): { plain: string[]; hashes: string[] } {
  const plain = Array.from({ length: RECOVERY_COUNT }, randomRecoveryCode);
  return { plain, hashes: plain.map(hashRecoveryCode) };
}

/**
 * Verifica un código contra la lista JSON de hashes; si acierta, devuelve la
 * lista SIN ese hash (un solo uso). null = código incorrecto.
 */
export function consumeRecoveryCode(
  code: string,
  storedJson: string | null,
): string | null {
  if (!storedJson) return null;
  let hashes: string[];
  try {
    hashes = JSON.parse(storedJson);
  } catch {
    return null;
  }
  if (!Array.isArray(hashes)) return null;
  const hash = hashRecoveryCode(code);
  if (!hashes.includes(hash)) return null;
  return JSON.stringify(hashes.filter((h) => h !== hash));
}
