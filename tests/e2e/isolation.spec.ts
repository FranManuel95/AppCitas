import { expect, test } from "@playwright/test";
import {
  ADMIN_B,
  firstIdForBusiness,
  getBusiness,
  getService,
  login,
} from "./helpers";

// Aislamiento multi-tenant: el admin del negocio B (Barbería Norte) no debe
// poder tocar NINGÚN recurso del negocio A (Estudio Aurora) por id. Esta es la
// red de seguridad de la tenancy a nivel de aplicación (la BD comparte esquema
// y la separación depende de que cada endpoint filtre por businessId).
test.describe("aislamiento entre negocios", () => {
  test("el admin de B no puede tocar recursos de A por id", async ({
    page,
  }) => {
    await login(page, ADMIN_B);
    const a = getBusiness("estudio-aurora"); // negocio ajeno

    const serviceA = firstIdForBusiness("Service", a.id);
    const staffA = firstIdForBusiness("StaffMember", a.id);
    const couponA = firstIdForBusiness("Coupon", a.id);
    const packageA = firstIdForBusiness("Package", a.id);
    const appointmentA = firstIdForBusiness("Appointment", a.id);

    const notFound = [404, 403];

    // Editar / borrar servicio ajeno
    let res = await page.request.patch(`/api/admin/services/${serviceA}`, {
      data: { name: "Hackeado" },
    });
    expect(notFound, "PATCH servicio ajeno").toContain(res.status());
    res = await page.request.delete(`/api/admin/services/${serviceA}`);
    expect(notFound, "DELETE servicio ajeno").toContain(res.status());

    // Editar empleado ajeno
    res = await page.request.patch(`/api/admin/staff/${staffA}`, {
      data: { name: "Hackeado" },
    });
    expect(notFound, "PATCH empleado ajeno").toContain(res.status());

    // Editar / borrar cupón ajeno
    res = await page.request.patch(`/api/admin/coupons/${couponA}`, {
      data: { active: false },
    });
    expect(notFound, "PATCH cupón ajeno").toContain(res.status());
    res = await page.request.delete(`/api/admin/coupons/${couponA}`);
    expect(notFound, "DELETE cupón ajeno").toContain(res.status());

    // Editar / borrar bono ajeno
    res = await page.request.patch(`/api/admin/packages/${packageA}`, {
      data: { active: false },
    });
    expect(notFound, "PATCH bono ajeno").toContain(res.status());
    res = await page.request.delete(`/api/admin/packages/${packageA}`);
    expect(notFound, "DELETE bono ajeno").toContain(res.status());

    // Cambiar el estado de una cita ajena
    res = await page.request.patch(
      `/api/admin/appointments/${appointmentA}/status`,
      { data: { status: "NO_SHOW" } },
    );
    expect(notFound, "PATCH estado cita ajena").toContain(res.status());

    // Reprogramar una cita ajena
    res = await page.request.post(
      `/api/admin/appointments/${appointmentA}/reschedule`,
      { data: { startAt: "2027-01-04T10:00:00.000Z" } },
    );
    expect(notFound, "POST reprogramar cita ajena").toContain(res.status());
  });

  test("el admin de B no puede vincular su empleado a un servicio de A", async ({
    page,
  }) => {
    await login(page, ADMIN_B);
    const a = getBusiness("estudio-aurora");
    const serviceA = getService(a.id, "Consulta inicial");

    const res = await page.request.post("/api/admin/staff", {
      data: { name: "Empleado Fuga", serviceIds: [serviceA.id] },
    });
    expect([404, 403], "crear staff con servicio ajeno").toContain(
      res.status(),
    );
  });
});
