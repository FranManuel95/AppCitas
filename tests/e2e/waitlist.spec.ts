import { expect, test } from "@playwright/test";
import { CLIENT, getBusiness, getService, login } from "./helpers";

// Flujo de lista de espera de cara al cliente (G-J/G-L): apuntarse, verlo en
// "Mis citas" y quitarse. Se crea y se borra su propia entrada, así que no
// acopla con el resto de la suite.
test.describe("lista de espera (cliente)", () => {
  test("apuntarse, verlo en Mis citas y quitarse", async ({ page }) => {
    await login(page, CLIENT);
    const business = getBusiness("estudio-aurora");
    const service = getService(business.id, "Consulta inicial");

    // Apuntarse a un día futuro (la API valida que no sea pasado).
    const res = await page.request.post("/api/waitlist", {
      data: {
        businessId: business.id,
        serviceId: service.id,
        desiredDate: "2027-06-01",
      },
    });
    expect(res.status()).toBe(201);

    await page.goto("/mis-citas");
    await expect(
      page.getByRole("heading", { name: "Lista de espera" }),
    ).toBeVisible();
    // El estado "A la espera" es exclusivo de la sección de lista de espera.
    await expect(page.getByText("A la espera")).toBeVisible();

    // Quitarse: la sección desaparece al no quedar entradas.
    await page.getByRole("button", { name: "Quitarme" }).first().click();
    await expect(
      page.getByRole("heading", { name: "Lista de espera" }),
    ).toHaveCount(0, { timeout: 10_000 });
  });
});
