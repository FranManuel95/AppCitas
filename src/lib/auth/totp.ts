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
