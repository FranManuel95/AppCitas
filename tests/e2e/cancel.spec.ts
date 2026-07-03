import { expect, test } from "@playwright/test";
import {
  CLIENT,
  freeSlots,
  getAppointmentStatus,
  getBusiness,
  getService,
  login,
  nextMonday,
  toDateISO,
} from "./helpers";

test.describe("política de cancelación", () => {
  test("cancelar con más de 24 h es gratis", async ({ page }) => {
    await login(page, CLIENT);
    const business = getBusiness("estudio-aurora");
    const service = getService(business.id, "Consulta inicial");
    const date = toDateISO(nextMonday(28));
    const slots = await freeSlots(page, "estudio-aurora", service.id, date);
    expect(slots.length).toBeGreaterThan(0);

    const created = await page.request.post("/api/appointments", {
      data: {
        businessId: business.id,
        serviceId: service.id,
        startAt: slots[0].startAt,
      },
    });
    expect(created.status()).toBe(201);
    const { appointment } = (await created.json()) as {
      appointment: { id: string };
    };

    const cancelled = await page.request.post(
      `/api/appointments/${appointment.id}/cancel`,
    );
    expect(cancelled.status()).toBe(200);
    expect(getAppointmentStatus(appointment.id)).toBe("CANCELLED");
  });

  test("cancelar con menos de 24 h aplica el cargo (tardía)", async ({
    page,
  }) => {
    await login(page, CLIENT);
    const business = getBusiness("estudio-aurora");
    const service = getService(business.id, "Consulta inicial");

    // Primer hueco real dentro de las próximas 24 h (hoy o mañana).
    const now = Date.now();
    let lateSlot: string | null = null;
    for (const dayOffset of [0, 1]) {
      const d = new Date(now + dayOffset * 86_400_000);
      const slots = await freeSlots(
        page,
        "estudio-aurora",
        service.id,
        toDateISO(d),
      );
      const candidate = slots.find((s) => {
        const t = Date.parse(s.startAt);
        return t - now < 24 * 3_600_000 && t - now > 70 * 60_000;
      });
      if (candidate) {
        lateSlot = candidate.startAt;
        break;
      }
    }
    // Fin de semana sin huecos próximos: no se puede simular la tardía.
    test.skip(!lateSlot, "sin huecos en las próximas 24 h (negocio cerrado)");

    const created = await page.request.post("/api/appointments", {
      data: {
        businessId: business.id,
        serviceId: service.id,
        startAt: lateSlot,
      },
    });
    expect(created.status()).toBe(201);
    const { appointment } = (await created.json()) as {
      appointment: { id: string };
    };

    const cancelled = await page.request.post(
      `/api/appointments/${appointment.id}/cancel`,
    );
    expect(cancelled.status()).toBe(200);
    expect(getAppointmentStatus(appointment.id)).toBe("CANCELLED_LATE");
  });

  test("la cancelación gratuita funciona desde la interfaz", async ({
    page,
  }) => {
    await login(page, CLIENT);
    const business = getBusiness("estudio-aurora");
    const service = getService(business.id, "Sesión premium");
    const date = toDateISO(nextMonday(35));
    const slots = await freeSlots(page, "estudio-aurora", service.id, date);
    expect(slots.length).toBeGreaterThan(0);

    const created = await page.request.post("/api/appointments", {
      data: {
        businessId: business.id,
        serviceId: service.id,
        startAt: slots[0].startAt,
      },
    });
    expect(created.status()).toBe(201);
    const { appointment } = (await created.json()) as {
      appointment: { id: string };
    };

    // La cita más lejana queda la última de "Próximas": su botón de
    // cancelar es el último de la página.
    await page.goto("/mis-citas");
    await page.getByRole("button", { name: "Cancelar cita" }).last().click();
    await expect(
      page.getByText("Estás dentro del plazo: la cancelación es gratuita."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Confirmar cancelación" })
      .click();

    // El estado en BD es la verdad última.
    await expect
      .poll(() => getAppointmentStatus(appointment.id), { timeout: 10_000 })
      .toBe("CANCELLED");
  });
});
