import { test, expect } from "@playwright/test";
import { ADMIN, login } from "./helpers";

// Informes: la página carga con datos del seed y los CSV responden.
test.describe("informes", () => {
  test("la página renderiza y los CSV se descargan", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/admin/informes");

    await expect(
      page.getByRole("heading", { name: "Retención de clientes" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ventas por servicio" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ingresos por empleado" }),
    ).toBeVisible();

    for (const tipo of ["servicios", "empleados", "cohortes"]) {
      const res = await page.request.get(`/api/admin/reports?tipo=${tipo}`);
      expect(res.ok(), `csv ${tipo}`).toBeTruthy();
      expect(res.headers()["content-type"]).toContain("text/csv");
    }
  });
});
