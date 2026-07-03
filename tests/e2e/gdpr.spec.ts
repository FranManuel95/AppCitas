import { expect, test } from "@playwright/test";

// Autoservicio RGPD del cliente. Usa una cuenta desechable propia (registrada
// en el test) para no tocar los datos sembrados que usan las demás pruebas.
test.describe("RGPD (autoservicio del cliente)", () => {
  test("el cliente exporta y elimina (anonimiza) su cuenta", async ({
    page,
  }) => {
    const email = `e2e-gdpr-${Date.now()}@test.com`;

    const registered = await page.request.post("/api/auth/register", {
      data: { name: "Cuenta RGPD", email, password: "secret1234" },
    });
    expect(registered.status()).toBe(201);

    // Exportar: JSON descargable con la cuenta y sus colecciones.
    const exported = await page.request.get("/api/me/export");
    expect(exported.status()).toBe(200);
    expect(exported.headers()["content-disposition"]).toContain("attachment");
    const data = await exported.json();
    expect(data.account.email).toBe(email);
    expect(Array.isArray(data.appointments)).toBeTruthy();

    // Eliminar: anonimiza e invalida la sesión.
    const deleted = await page.request.post("/api/me/delete");
    expect(deleted.status()).toBe(200);
    expect((await deleted.json()).deleted).toBe(true);

    // La sesión ya no vale: exportar de nuevo exige autenticación (401).
    const afterDelete = await page.request.get("/api/me/export");
    expect(afterDelete.status()).toBe(401);
  });
});
