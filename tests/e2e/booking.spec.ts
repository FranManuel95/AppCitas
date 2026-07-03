import { expect, test } from "@playwright/test";
import {
  CLIENT,
  freeSlots,
  getBusiness,
  getService,
  login,
  nextMonday,
  toDateISO,
} from "./helpers";

test.describe("reserva", () => {
  test("el cliente reserva por el wizard de principio a fin", async ({
    page,
  }) => {
    await login(page, CLIENT);
    await page.goto("/b/estudio-aurora/reservar");

    // Paso 1: servicio
    await page
      .getByRole("button", { name: /Consulta inicial/ })
      .first()
      .click();

    // Paso 2/3: fecha laborable futura y primer hueco libre
    const date = toDateISO(nextMonday(14));
    await page.locator('input[type="date"]').fill(date);
    const slot = page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first();
    await expect(slot).toBeVisible({ timeout: 15_000 });
    const slotLabel = await slot.textContent();
    await slot.click();

    // Confirmación: el CTA lleva "Reservar {servicio} · {hueco}"
    await page.getByRole("button", { name: /^Reservar / }).click();
    await expect(page.getByText("¡Cita confirmada!")).toBeVisible({
      timeout: 15_000,
    });
    expect(slotLabel).toMatch(/^\d{2}:\d{2}$/);
  });

  test("con el aforo completo la reserva se rechaza (409)", async ({
    page,
  }) => {
    await login(page, CLIENT);
    // Barbería Norte tiene 2 sillas: la tercera reserva del mismo hueco choca.
    const business = getBusiness("barberia-norte");
    const service = getService(business.id, "Corte + barba");
    const date = toDateISO(nextMonday(21));
    const slots = await freeSlots(page, "barberia-norte", service.id, date);
    expect(slots.length).toBeGreaterThan(0);

    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await page.request.post("/api/appointments", {
        data: {
          businessId: business.id,
          serviceId: service.id,
          startAt: slots[0].startAt,
        },
      });
      statuses.push(res.status());
    }
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBe(201);
    expect(statuses[2]).toBe(409);
  });
});
