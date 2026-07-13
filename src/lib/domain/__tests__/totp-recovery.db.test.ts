import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticator } from "otplib";

// createSession escribe cookies con next/headers, que no existe fuera de una
// request real de Next: se sustituye por un no-op (aquí se prueba el 2FA, no
// la cookie).
vi.mock("@/lib/auth/session", () => ({
  createSession: vi.fn(async () => {}),
}));
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import {
  consumeRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  looksLikeRecoveryCode,
} from "@/lib/auth/totp";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { resetDb } from "@/lib/test/factories";

function loginRequest(body: object) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("códigos de recuperación 2FA", () => {
  it("genera 8 códigos XXXX-XXXX y su consumo es de un solo uso", () => {
    const { plain, hashes } = generateRecoveryCodes();
    expect(plain).toHaveLength(8);
    expect(hashes).toHaveLength(8);
    for (const code of plain) {
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(looksLikeRecoveryCode(code)).toBe(true);
    }
    // Un TOTP de 6 dígitos NO parece código de recuperación
    expect(looksLikeRecoveryCode("123456")).toBe(false);

    const stored = JSON.stringify(hashes);
    const after = consumeRecoveryCode(plain[0], stored);
    expect(after).not.toBeNull();
    expect(JSON.parse(after!)).toHaveLength(7);
    // El mismo código ya no vale (un solo uso)
    expect(consumeRecoveryCode(plain[0], after)).toBeNull();
    // Normalización: minúsculas y sin guion también valen
    expect(
      consumeRecoveryCode(plain[1].toLowerCase().replace("-", ""), after),
    ).not.toBeNull();
    // Código inventado → null
    expect(consumeRecoveryCode("AAAA-AAAA", stored)).toBeNull();
  });

  describe("login con código de recuperación (BD)", () => {
    beforeEach(async () => {
      await resetDb();
    });

    it("entra con un código, se consume, y el TOTP sigue funcionando", async () => {
      const secret = generateTotpSecret();
      const { plain, hashes } = generateRecoveryCodes();
      await prisma.user.create({
        data: {
          email: "duena2fa@test.local",
          name: "Dueña",
          passwordHash: await hashPassword("secreta-123"),
          role: "CLIENT",
          totpSecret: secret,
          totpEnabledAt: new Date(),
          totpRecoveryCodes: JSON.stringify(hashes),
        },
      });

      // Sin código → TOTP_REQUIRED
      const noCode = await loginRoute(
        loginRequest({ email: "duena2fa@test.local", password: "secreta-123" }),
      );
      expect(noCode.status).toBe(401);
      expect((await noCode.json()).code).toBe("TOTP_REQUIRED");

      // Con código de recuperación → entra y el código se consume
      const withRecovery = await loginRoute(
        loginRequest({
          email: "duena2fa@test.local",
          password: "secreta-123",
          totpCode: plain[0],
        }),
      );
      expect(withRecovery.status).toBe(200);
      const row = await prisma.user.findUniqueOrThrow({
        where: { email: "duena2fa@test.local" },
        select: { totpRecoveryCodes: true },
      });
      const remaining: string[] = JSON.parse(row.totpRecoveryCodes!);
      expect(remaining).toHaveLength(7);
      expect(remaining).not.toContain(hashRecoveryCode(plain[0]));

      // Reutilizar el mismo código → rechazado
      const reuse = await loginRoute(
        loginRequest({
          email: "duena2fa@test.local",
          password: "secreta-123",
          totpCode: plain[0],
        }),
      );
      expect(reuse.status).toBe(401);
      expect((await reuse.json()).code).toBe("TOTP_BAD_CODE");

      // El TOTP normal sigue funcionando
      const withTotp = await loginRoute(
        loginRequest({
          email: "duena2fa@test.local",
          password: "secreta-123",
          totpCode: authenticator.generate(secret),
        }),
      );
      expect(withTotp.status).toBe(200);
    });
  });
});
