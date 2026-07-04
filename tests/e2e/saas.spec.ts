import { expect, test } from "@playwright/test";
import { ADMIN, e2eDb, getBusiness, login } from "./helpers";

const SUPER = { email: "plataforma@demo.com", password: "admin1234" };

// Fija el plan/estado de un negocio directamente en la BD E2E.
function setPlan(businessId: string, plan: string, status: string) {
  const db = new (require("better-sqlite3"))(
    require("path").join(__dirname, "..", "..", "e2e.db"),
  );
  try {
    db.prepare(
      `UPDATE Business SET plan = ?, subscriptionStatus = ? WHERE id = ?`,
    ).run(plan, status, businessId);
  } finally {
    db.close();
  }
}

test.describe("capa SaaS", () => {
  test("el plan free bloquea añadir un empleado por encima del límite", async ({
    page,
  }) => {
    const a = getBusiness("estudio-aurora");
    setPlan(a.id, "free", "active"); // límite 1 empleado; el seed ya tiene 3
    await login(page, ADMIN);

    const res = await page.request.post("/api/admin/staff", {
      data: { name: "Empleado Extra" },
    });
    expect(res.status()).toBe(402);
    const json = await res.json();
    expect(json.code).toBe("PLAN_LIMIT_STAFF");
  });

  test("el checkout en modo dev activa el plan Pro", async ({ page }) => {
    const a = getBusiness("estudio-aurora");
    setPlan(a.id, "free", "canceled");
    await login(page, ADMIN);

    const res = await page.request.post("/api/billing/checkout");
    expect(res.ok()).toBeTruthy();
    const { url } = await res.json();
    expect(url).toContain("/admin/plan");

    const db = e2eDb();
    const row = db
      .prepare(`SELECT plan, subscriptionStatus FROM Business WHERE id = ?`)
      .get(a.id) as { plan: string; subscriptionStatus: string };
    db.close();
    expect(row.plan).toBe("pro");
    expect(row.subscriptionStatus).toBe("active");
  });

  test("solo el super-admin accede al panel de plataforma", async ({
    page,
  }) => {
    const b = getBusiness("barberia-norte");

    // Admin de negocio: la API de plataforma le da 403
    await login(page, ADMIN);
    let res = await page.request.patch(`/api/superadmin/businesses/${b.id}`, {
      data: { active: false },
    });
    expect(res.status()).toBe(403);

    // Super-admin: puede suspender/reactivar
    await login(page, SUPER);
    res = await page.request.patch(`/api/superadmin/businesses/${b.id}`, {
      data: { active: false },
    });
    expect(res.ok()).toBeTruthy();
    res = await page.request.patch(`/api/superadmin/businesses/${b.id}`, {
      data: { active: true },
    });
    expect(res.ok()).toBeTruthy();
  });

  test("el super-admin ve el dashboard de métricas de plataforma", async ({
    page,
  }) => {
    await login(page, SUPER);
    await page.goto("/superadmin");
    // Métricas agregadas + serie mensual.
    await expect(page.getByText("MRR estimado")).toBeVisible();
    await expect(page.getByText("Citas este mes")).toBeVisible();
    await expect(page.getByText("Últimos 6 meses")).toBeVisible();
  });
});
