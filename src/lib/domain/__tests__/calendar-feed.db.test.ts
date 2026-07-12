import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET as feedRoute } from "@/app/api/feeds/[token]/route";
import { createAppointment } from "../appointments";
import {
  resetDb,
  seedBusiness,
  seedClient,
  seedStaff,
  slotAt,
} from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");

async function fetchFeed(token: string, staffId?: string) {
  const url = `http://localhost/api/feeds/${token}${staffId ? `?staff=${staffId}` : ""}`;
  return feedRoute(new Request(url), {
    params: Promise.resolve({ token }),
  });
}

// Feed iCal privado: el token es la autenticación; incluye las citas activas
// y permite filtrar por empleado (calendario personal).
describe("feed de calendario (BD)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("devuelve las citas del negocio como VEVENTs; token falso → 404", async () => {
    const { businessId, serviceId } = await seedBusiness();
    await prisma.business.update({
      where: { id: businessId },
      data: { icsFeedToken: "cal_test_token" },
    });
    const clientId = await seedClient();
    // Cita futura cercana (dentro de la ventana del feed, reloj real)
    const start = new Date(Date.now() + 2 * 86_400_000);
    start.setUTCHours(10, 0, 0, 0);
    await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: start,
    });

    const res = await fetchFeed("cal_test_token");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("Servicio");

    const bad = await fetchFeed("cal_token_falso");
    expect(bad.status).toBe(404);
  });

  it("?staff= filtra el calendario personal del empleado", async () => {
    const { businessId, serviceId } = await seedBusiness();
    await prisma.business.update({
      where: { id: businessId },
      data: { icsFeedToken: "cal_staff_token" },
    });
    const staffA = await seedStaff(businessId);
    const staffB = await seedStaff(businessId);
    const clientId = await seedClient();
    const start = new Date(Date.now() + 2 * 86_400_000);
    start.setUTCHours(10, 0, 0, 0);
    await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: start,
      staffId: staffA,
      now: NOW,
    });

    const withA = await (await fetchFeed("cal_staff_token", staffA)).text();
    expect(withA).toContain("BEGIN:VEVENT");
    const withB = await (await fetchFeed("cal_staff_token", staffB)).text();
    expect(withB).not.toContain("BEGIN:VEVENT");
  });
});
