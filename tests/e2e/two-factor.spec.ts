import { test, expect } from "@playwright/test";
import { authenticator } from "otplib";
import { ADMIN, login } from "./helpers";

// V-6/W-1: activar 2FA → el login exige código TOTP → entra con el código.
// El código se genera en el test con otplib (misma librería que la app).
test.describe("doble factor (TOTP)", () => {
  test("activar, exigir código en el login y desactivar", async ({
    browser,
  }) => {
    const setupContext = await browser.newContext();
    const page = await setupContext.newPage();
    await login(page, ADMIN);

    // Activación: POST genera el secreto, PUT lo confirma con un código
    const start = await page.request.post("/api/me/2fa");
    expect(start.ok(), await start.text()).toBeTruthy();
    const { secret } = (await start.json()) as { secret: string };

    const confirm = await page.request.put("/api/me/2fa", {
      data: { code: authenticator.generate(secret) },
    });
    expect(confirm.ok(), await confirm.text()).toBeTruthy();
    const confirmed = (await confirm.json()) as { recoveryCodes: string[] };
    // W-1: códigos de recuperación mostrados UNA vez al activar
    expect(confirmed.recoveryCodes).toHaveLength(8);
    await setupContext.close();

    // Sesión nueva: sin código el login pide TOTP…
    const freshContext = await browser.newContext();
    const fresh = await freshContext.newPage();
    const noCode = await fresh.request.post("/api/auth/login", {
      data: ADMIN,
    });
    expect(noCode.status()).toBe(401);
    const body = (await noCode.json()) as { code: string };
    expect(body.code).toBe("TOTP_REQUIRED");

    // …y con el código entra
    const withCode = await fresh.request.post("/api/auth/login", {
      data: { ...ADMIN, totpCode: authenticator.generate(secret) },
    });
    expect(withCode.ok(), await withCode.text()).toBeTruthy();
    await fresh.goto("/admin");
    await expect(fresh).toHaveURL(/\/admin/);

    // Limpieza: desactivar para no afectar a otros specs (BD compartida)
    const disable = await fresh.request.delete("/api/me/2fa", {
      data: { code: authenticator.generate(secret) },
    });
    expect(disable.ok(), await disable.text()).toBeTruthy();
    await freshContext.close();
  });
});
