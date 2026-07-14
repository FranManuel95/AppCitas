import { test, expect } from "@playwright/test";
import { ADMIN, e2eDb, getBusiness, login } from "./helpers";

function staffIdByName(businessId: string, name: string): string {
  const db = e2eDb();
  try {
    const row = db
      .prepare(`SELECT id FROM StaffMember WHERE businessId = ? AND name = ?`)
      .get(businessId, name) as { id: string } | undefined;
    if (!row) throw new Error(`empleado ${name} no sembrado`);
    return row.id;
  } finally {
    db.close();
  }
}

// Multi-sede en el wizard público: con 2 sedes activas y equipo, aparece el
// selector y la sede elegida filtra a los profesionales de la otra. El spec
// crea las sedes vía API y las desmonta al final para no contaminar al resto.
test.describe("multi-sede", () => {
  test("el selector de sede aparece y filtra el equipo", async ({ page }) => {
    await login(page, ADMIN);
    const business = getBusiness("estudio-aurora");
    const ana = staffIdByName(business.id, "Ana García");

    const mkLocation = async (name: string) => {
      const res = await page.request.post("/api/admin/locations", {
        data: { name },
      });
      expect(res.status(), await res.text()).toBe(201);
      return ((await res.json()) as { location: { id: string } }).location.id;
    };
    const centroId = await mkLocation("Sede Centro E2E");
    const norteId = await mkLocation("Sede Norte E2E");

    try {
      // Ana atiende solo en Centro
      const assign = await page.request.patch(`/api/admin/staff/${ana}`, {
        data: { locationId: centroId },
      });
      expect(assign.ok(), await assign.text()).toBeTruthy();

      await page.goto("/b/estudio-aurora/reservar");
      // Selector de sede visible con las dos sedes
      const centro = page.getByRole("button", { name: /Sede Centro E2E/ });
      const norte = page.getByRole("button", { name: /Sede Norte E2E/ });
      await expect(centro).toBeVisible();
      await expect(norte).toBeVisible();

      // En Norte, Ana (asignada a Centro) no se ofrece; en Centro sí
      await norte.click();
      await expect(
        page.getByRole("button", { name: /Ana García/ }),
      ).toBeHidden();
      await centro.click();
      await expect(
        page.getByRole("button", { name: /Ana García/ }),
      ).toBeVisible();
    } finally {
      // Limpieza: desasignar a Ana y desactivar las sedes
      await page.request.patch(`/api/admin/staff/${ana}`, {
        data: { locationId: null },
      });
      for (const id of [centroId, norteId]) {
        await page.request.patch(`/api/admin/locations/${id}`, {
          data: { active: false },
        });
      }
    }
  });
});
