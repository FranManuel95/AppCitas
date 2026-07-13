import { test, expect } from "@playwright/test";
import {
  ADMIN,
  freeSlots,
  getAppointmentStatus,
  getBusiness,
  getService,
  login,
  nextMonday,
  toDateISO,
} from "./helpers";

// V-3: serie recurrente desde la reserva de mostrador del negocio → varias
// ocurrencias con el mismo seriesId → cancelar la serie entera de una vez.
test.describe("citas recurrentes", () => {
  test("crear una serie semanal y cancelarla entera", async ({ page }) => {
    await login(page, ADMIN);
    const business = getBusiness("estudio-aurora");
    const service = getService(business.id, "Sesión estándar");
    const day = toDateISO(nextMonday(40));

    const slots = await freeSlots(page, "estudio-aurora", service.id, day);
    expect(slots.length).toBeGreaterThan(0);

    const create = await page.request.post("/api/admin/appointments", {
      data: {
        serviceId: service.id,
        client: { name: "Cliente Serie E2E", email: "serie-e2e@test.local" },
        startAt: slots[0].startAt,
        recurrence: { intervalDays: 7, count: 3 },
      },
    });
    expect(create.ok(), await create.text()).toBeTruthy();
    const json = (await create.json()) as {
      seriesId: string;
      created: Array<{ id: string; startAt: string }>;
    };
    expect(json.created).toHaveLength(3);
    // Cada ocurrencia repite la hora de pared, 7 días después
    const days = json.created.map((a) => a.startAt.slice(0, 10));
    expect(new Set(days).size).toBe(3);

    // El panel muestra la serie
    await page.goto("/admin/citas");
    await expect(page.getByText("Cliente Serie E2E").first()).toBeVisible();

    // Cancelar lo que queda de la serie de una vez
    const cancel = await page.request.delete(
      `/api/admin/appointments/series/${json.seriesId}`,
    );
    expect(cancel.ok(), await cancel.text()).toBeTruthy();
    for (const a of json.created) {
      expect(getAppointmentStatus(a.id)).toBe("CANCELLED");
    }
  });
});
