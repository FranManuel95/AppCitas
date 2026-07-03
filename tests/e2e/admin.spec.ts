import { expect, test } from "@playwright/test";
import { ADMIN, STAFF, e2eDb, getBusiness, login } from "./helpers";

test.describe("panel del negocio", () => {
  test("el dashboard carga con sus KPIs", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await expect(page.getByText("Ingresos del mes")).toBeVisible();
  });

  test("el dueño puede cambiar el precio de un servicio", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/admin/servicios");
    await expect(page.getByText("Consulta inicial").first()).toBeVisible();

    await page.getByRole("button", { name: "Editar" }).first().click();
    const price = page.locator('input[name="price"]');
    await expect(price).toBeVisible();
    await price.fill("26");
    await page.getByRole("button", { name: "Guardar cambios" }).click();

    await expect(page.getByText("26,00").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("un empleado no puede tocar citas de otro negocio", async ({
    page,
  }) => {
    await login(page, STAFF); // Ana pertenece a Estudio Aurora
    const barberia = getBusiness("barberia-norte");
    const db = e2eDb();
    let foreignAppointment: { id: string } | undefined;
    try {
      foreignAppointment = db
        .prepare(
          `SELECT id FROM Appointment WHERE businessId = ? LIMIT 1`,
        )
        .get(barberia.id) as { id: string } | undefined;
    } finally {
      db.close();
    }
    expect(foreignAppointment).toBeDefined();

    const res = await page.request.patch(
      `/api/staff/appointments/${foreignAppointment!.id}/status`,
      { data: { status: "COMPLETED" } },
    );
    expect([403, 404]).toContain(res.status());
  });
});
