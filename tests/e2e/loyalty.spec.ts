import { test, expect } from "@playwright/test";
import {
  ADMIN,
  CLIENT,
  e2eDb,
  freeSlots,
  getBusiness,
  getService,
  login,
  nextMonday,
  toDateISO,
} from "./helpers";

// Tarjeta de sellos: con el programa activo (2 sellos), completar 2 citas
// genera automáticamente el cupón premio personal del cliente.
test.describe("tarjeta de sellos", () => {
  test("2 citas completadas generan el cupón premio", async ({ page }) => {
    await login(page, ADMIN);
    const enable = await page.request.put("/api/admin/loyalty", {
      data: {
        active: true,
        stampsRequired: 2,
        rewardPercent: 20,
        rewardValidityDays: 60,
      },
    });
    expect(enable.ok(), await enable.text()).toBeTruthy();

    const business = getBusiness("estudio-aurora");
    const service = getService(business.id, "Consulta inicial");

    try {
      // El cliente reserva 2 citas y el negocio las completa
      await login(page, CLIENT);
      const date = toDateISO(nextMonday(28));
      const slots = await freeSlots(page, "estudio-aurora", service.id, date);
      expect(slots.length).toBeGreaterThan(1);

      const ids: string[] = [];
      for (const slot of slots.slice(0, 2)) {
        const created = await page.request.post("/api/appointments", {
          data: {
            businessId: business.id,
            serviceId: service.id,
            startAt: slot.startAt,
          },
        });
        expect(created.status()).toBe(201);
        ids.push(
          ((await created.json()) as { appointment: { id: string } })
            .appointment.id,
        );
      }

      await login(page, ADMIN);
      for (const id of ids) {
        const done = await page.request.patch(
          `/api/admin/appointments/${id}/status`,
          { data: { status: "COMPLETED" } },
        );
        expect(done.ok(), await done.text()).toBeTruthy();
      }

      // El premio es un cupón personal SELLOS-… del cliente
      const db = e2eDb();
      try {
        const coupon = db
          .prepare(
            `SELECT code FROM Coupon WHERE businessId = ? AND clientId IS NOT NULL AND code LIKE 'SELLOS-%'`,
          )
          .get(business.id) as { code: string } | undefined;
        expect(coupon?.code).toMatch(/^SELLOS-/);
      } finally {
        db.close();
      }
    } finally {
      await login(page, ADMIN);
      await page.request.put("/api/admin/loyalty", {
        data: {
          active: false,
          stampsRequired: 2,
          rewardPercent: 20,
          rewardValidityDays: 60,
        },
      });
    }
  });
});
