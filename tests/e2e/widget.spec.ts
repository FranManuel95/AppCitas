import { test, expect } from "@playwright/test";

// V-5: el widget embebible responde, enlaza a la reserva y NO envía
// X-Frame-Options DENY (debe poder incrustarse en la web del negocio).
test.describe("widget embebible", () => {
  test("responde sin X-Frame-Options y con CTA a reservar", async ({
    page,
  }) => {
    const res = await page.goto("/widget/estudio-aurora");
    expect(res, "respuesta del widget").not.toBeNull();
    expect(res!.status()).toBe(200);

    // Incrustable: sin X-Frame-Options DENY (el resto de la app sí lo lleva)
    const headers = res!.headers();
    expect(headers["x-frame-options"]).toBeUndefined();

    // El CTA apunta a la página de reserva del negocio
    const cta = page.locator('a[href*="/b/estudio-aurora"]').first();
    await expect(cta).toBeVisible();

    // Control: la home SÍ va protegida contra clickjacking
    const home = await page.goto("/");
    expect(home!.headers()["x-frame-options"]).toBe("DENY");
  });
});
