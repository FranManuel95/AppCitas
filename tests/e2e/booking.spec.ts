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

    // Tira multi-día: los chips de los próximos días aparecen con su nº de
    // huecos y hacer click cambia la fecha seleccionada
    const strip = page.getByLabel("Próximos días con disponibilidad");
    await expect(strip).toBeVisible();
    await expect(
      strip.getByRole("button", { name: /huecos/ }).first(),
    ).toBeVisible({ timeout: 15_000 });

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

  test("invitado: reserva sin cuenta y gestiona la cita desde /c/{token}", async ({
    page,
  }) => {
    // Sin login: el wizard muestra el formulario de invitado
    await page.goto("/b/estudio-aurora/reservar");
    await page
      .getByRole("button", { name: /Consulta inicial/ })
      .first()
      .click();

    const date = toDateISO(nextMonday(28));
    await page.locator('input[type="date"]').fill(date);
    const slot = page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first();
    await expect(slot).toBeVisible({ timeout: 15_000 });
    await slot.click();

    // Tus datos + consentimiento
    await page.locator("#invitado-nombre").fill("Invitada E2E");
    await page
      .locator("#invitado-email")
      .fill(`invitada-${Date.now()}@test.local`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /^Reservar / }).click();
    await expect(page.getByText("¡Cita confirmada!")).toBeVisible({
      timeout: 15_000,
    });

    // El enlace de gestión lleva a /c/{token}, donde puede cancelar
    await page.getByRole("link", { name: "Gestionar mi cita" }).click();
    await expect(page).toHaveURL(/\/c\/[a-z0-9]+/i);
    await page.getByRole("button", { name: "Cancelar esta cita" }).click();
    await page.getByRole("button", { name: "Sí, cancelar la cita" }).click();
    await expect(page.getByText("Cancelada", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
