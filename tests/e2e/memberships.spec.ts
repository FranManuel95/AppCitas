import { test, expect } from "@playwright/test";
import { ADMIN, CLIENT, e2eDb, getBusiness, login } from "./helpers";

// Membresías de clientes de punta a punta en modo simulado (sin claves de
// Stripe): el negocio crea un plan, el cliente lo ve en la página pública y
// se da de alta; la suscripción queda activa y visible en "Mis citas".
test.describe("membresías", () => {
  test("plan visible en /b y alta simulada del cliente", async ({ page }) => {
    await login(page, ADMIN);
    const created = await page.request.post("/api/admin/membership-plans", {
      data: {
        name: "Club E2E",
        priceCents: 1900,
        discountPercent: 15,
        maxAppointmentsPerMonth: null,
      },
    });
    expect(created.status()).toBe(201);
    const { plan } = (await created.json()) as { plan: { id: string } };

    try {
      // Visible en la página pública del negocio
      await page.goto("/b/estudio-aurora");
      await expect(page.getByText("Club E2E")).toBeVisible();

      // Alta del cliente (simulada: sin STRIPE_SECRET_KEY)
      await login(page, CLIENT);
      const sub = await page.request.post("/api/memberships", {
        data: { planId: plan.id },
      });
      expect(sub.ok(), await sub.text()).toBeTruthy();

      const business = getBusiness("estudio-aurora");
      const db = e2eDb();
      try {
        const row = db
          .prepare(
            `SELECT status FROM ClientMembership WHERE businessId = ? AND planId = ?`,
          )
          .get(business.id, plan.id) as { status: string } | undefined;
        expect(row?.status).toBe("active");
      } finally {
        db.close();
      }

      await page.goto("/mis-citas");
      await expect(page.getByText("Club E2E").first()).toBeVisible();
    } finally {
      // Limpieza: desactivar el plan para no contaminar otros specs
      await login(page, ADMIN);
      await page.request.patch(`/api/admin/membership-plans/${plan.id}`, {
        data: { active: false },
      });
    }
  });
});
