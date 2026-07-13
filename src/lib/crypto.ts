import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

// Cifrado simétrico para secretos en reposo (tokens OAuth de Google Calendar).
// AES-256-GCM con clave derivada de AUTH_SECRET: no hay que gestionar una
// clave nueva, pero rotar AUTH_SECRET invalida los tokens cifrados (los
// usuarios reconectan su calendario con un clic; documentado en SECURITY.md).

function key(): Buffer {
  const secret =
    process.env.AUTH_SECRET ?? "appcitas-dev-secret-no-usar-en-produccion";
  return createHash("sha256").update(`${secret}:calendar-tokens`).digest();
}

/** Cifra un texto → "iv.ciphertext.tag" (base64url). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${ct.toString("base64url")}.${tag.toString("base64url")}`;
}

/** Descifra lo cifrado por encryptSecret. Lanza si el dato está manipulado. */
export function decryptSecret(sealed: string): string {
  const [iv, ct, tag] = sealed.split(".");
  if (!iv || !ct || !tag) throw new Error("Formato de secreto no válido");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ct, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
