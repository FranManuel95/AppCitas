import { test, expect } from "@playwright/test";
import { ADMIN, login } from "./helpers";

// V-7: feed iCal privado de la agenda — activar genera una URL con token,
// el .ics lleva eventos y desactivar revoca la URL.
test.describe("feed iCal de la agenda", () => {
  test("activar → .ics con VEVENT → desactivar revoca", async ({ page }) => {
    await login(page, ADMIN);

    const activate = await page.request.post("/api/admin/calendar-feed");
    expect(activate.ok(), await activate.text()).toBeTruthy();
    const { token } = (await activate.json()) as { token: string };
    expect(token.startsWith("cal_")).toBeTruthy();

    const feed = await page.request.get(`/api/feeds/${token}`);
    expect(feed.ok()).toBeTruthy();
    expect(feed.headers()["content-type"]).toContain("text/calendar");
    const ics = await feed.text();
    expect(ics).toContain("BEGIN:VCALENDAR");
    // El seed tiene citas confirmadas próximas: debe haber eventos
    expect(ics).toContain("BEGIN:VEVENT");

    // Desactivar: la URL deja de funcionar
    const deactivate = await page.request.delete("/api/admin/calendar-feed");
    expect(deactivate.ok()).toBeTruthy();
    const gone = await page.request.get(`/api/feeds/${token}`);
    expect(gone.status()).toBe(404);
  });
});
