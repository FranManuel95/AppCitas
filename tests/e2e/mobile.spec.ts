import { expect, test } from "@playwright/test";
import { ADMIN, CLIENT, login } from "./helpers";

// UX móvil (U-2): la barra inferior del panel llega a todo con ≤2 taps y el
// CTA de reservar queda siempre visible sin hacer scroll hasta el final.
test.use({ viewport: { width: 390, height: 844 } });

test.describe("móvil", () => {
  test("panel: barra inferior y hoja 'Más' llegan a Ajustes", async ({
    page,
  }) => {
    await login(page, ADMIN);
    await page.goto("/admin");

    // La barra inferior está visible con sus destinos de uso diario.
    const bottomNav = page.locator("nav.fixed.bottom-0");
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.getByRole("link", { name: "Agenda" })).toBeVisible();

    // "Más" abre la hoja con todas las secciones y navega a Ajustes.
    await bottomNav.getByRole("button", { name: "Más" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Configuración")).toBeVisible({
      timeout: 15_000,
    });
    // La hoja entra con animación: espera a que el enlace esté visible y
    // estable antes de pulsarlo, para no clicar sobre el overlay en transición.
    const ajustesLink = sheet.getByRole("link", { name: "Ajustes" });
    await expect(ajustesLink).toBeVisible({ timeout: 15_000 });
    await ajustesLink.click();
    await expect(page).toHaveURL(/\/admin\/ajustes/, { timeout: 15_000 });
    // La hoja se cierra sola al navegar.
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
  });

  test("reserva: el CTA fijo está visible sin llegar al final", async ({
    page,
  }) => {
    await login(page, CLIENT);
    await page.goto("/b/estudio-aurora/reservar");

    // Sin hueco elegido, la barra fija ya ofrece la acción (lleva a la fecha).
    const bar = page.locator("div.fixed.bottom-0.z-40").filter({
      has: page.getByRole("button"),
    });
    await expect(bar.getByRole("button")).toBeVisible();
    await expect(bar.getByRole("button")).toContainText(
      "Elige un hueco para reservar",
    );
  });
});
