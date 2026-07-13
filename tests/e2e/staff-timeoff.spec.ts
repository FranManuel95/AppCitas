import { test, expect } from "@playwright/test";
import {
  ADMIN,
  e2eDb,
  freeSlots,
  getBusiness,
  getService,
  login,
  nextMonday,
  toDateISO,
} from "./helpers";

// V-1: una ausencia (vacaciones/baja) de TODO el equipo deja el día sin
// huecos; al quitarla, los huecos vuelven.
test.describe("ausencias del equipo", () => {
  test("con todo el equipo ausente el día no ofrece huecos", async ({
    page,
  }) => {
    await login(page, ADMIN);
    const business = getBusiness("estudio-aurora");
    const service = getService(business.id, "Sesión estándar");
    const day = toDateISO(nextMonday(30));

    const before = await freeSlots(page, "estudio-aurora", service.id, day);
    expect(before.length).toBeGreaterThan(0);

    // Ausencia de TODOS los empleados activos ese día
    const db = e2eDb();
    const staff = db
      .prepare(`SELECT id FROM StaffMember WHERE businessId = ? AND active = 1`)
      .all(business.id) as Array<{ id: string }>;
    db.close();
    expect(staff.length).toBeGreaterThan(0);

    const created: Array<{ staffId: string; timeOffId: string }> = [];
    for (const member of staff) {
      const res = await page.request.post(
        `/api/admin/staff/${member.id}/timeoff`,
        { data: { startDate: day, endDate: day, reason: "E2E vacaciones" } },
      );
      expect(res.ok(), `timeoff ${member.id}`).toBeTruthy();
      const json = (await res.json()) as { timeOff: { id: string } };
      created.push({ staffId: member.id, timeOffId: json.timeOff.id });
    }

    const during = await freeSlots(page, "estudio-aurora", service.id, day);
    expect(during).toHaveLength(0);

    // Limpieza: al quitar las ausencias, los huecos vuelven
    for (const { staffId, timeOffId } of created) {
      const res = await page.request.delete(
        `/api/admin/staff/${staffId}/timeoff/${timeOffId}`,
      );
      expect(res.ok()).toBeTruthy();
    }
    const after = await freeSlots(page, "estudio-aurora", service.id, day);
    expect(after.length).toBeGreaterThan(0);
  });
});
