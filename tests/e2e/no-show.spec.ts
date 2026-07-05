import { expect, test } from "@playwright/test";
import {
  ADMIN,
  CLIENT,
  e2eDb,
  freeSlots,
  getAppointmentStatus,
  getBusiness,
  getService,
  login,
  nextMonday,
  toDateISO,
} from "./helpers";

// El negocio marca no-show sobre una cita recién reservada: se aplica la
// comisión y se avisa al cliente (G-P). Reserva su propia cita, así que no
// depende del sembrado compartido.
test.describe("no presentado", () => {
  test("marcar no-show aplica comisión y avisa al cliente", async ({
    page,
  }) => {
    // El cliente reserva una cita.
    await login(page, CLIENT);
    const business = getBusiness("estudio-aurora");
    const service = getService(business.id, "Consulta inicial");
    const date = toDateISO(nextMonday(21));
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

    // El dueño del negocio la marca como no presentado.
    await login(page, ADMIN);
    const res = await page.request.patch(
      `/api/admin/appointments/${appointment.id}/status`,
      { data: { status: "NO_SHOW" } },
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      appointment: { status: string; chargedCents: number };
    };
    expect(body.appointment.status).toBe("NO_SHOW");
    expect(body.appointment.chargedCents).toBeGreaterThan(0);
    expect(getAppointmentStatus(appointment.id)).toBe("NO_SHOW");

    // Se ha encolado el aviso de no-show al cliente.
    const db = e2eDb();
    try {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS c FROM Notification WHERE appointmentId = ? AND template = 'NO_SHOW'`,
        )
        .get(appointment.id) as { c: number };
      expect(row.c).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});
