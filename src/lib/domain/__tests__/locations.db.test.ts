import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAppointment, getAvailability } from "../appointments";
import {
  createLocation,
  getBookableLocations,
  updateLocation,
} from "../locations";
import { getDayAgenda } from "../stats";
import { resetDb, seedBusiness, seedClient, seedStaff, slotAt } from "@/lib/test/factories";

const NOW = new Date("2026-07-12T12:00:00.000Z");

describe("multi-sede (BD)", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("la 2ª sede exige equipo activo y no se desactiva con empleados asignados", async () => {
    const { businessId } = await seedBusiness();
    const first = await createLocation(businessId, { name: "Centro" });

    // Sin equipo: la segunda sede se rechaza
    await expect(
      createLocation(businessId, { name: "Norte" }),
    ).rejects.toMatchObject({ code: "LOCATIONS_REQUIRE_STAFF" });

    const staffId = await seedStaff(businessId);
    const second = await createLocation(businessId, { name: "Norte" });
    await prisma.staffMember.update({
      where: { id: staffId },
      data: { locationId: second.id },
    });

    // Con un empleado asignado, la sede no se desactiva
    await expect(
      updateLocation(businessId, second.id, { active: false }),
    ).rejects.toMatchObject({ code: "LOCATION_HAS_STAFF" });
    // La otra (sin empleados) sí
    await updateLocation(businessId, first.id, { active: false });
  });

  it("el selector público solo aparece con >1 sede activa y equipo", async () => {
    const { businessId } = await seedBusiness();
    expect(await getBookableLocations(businessId)).toHaveLength(0);

    const staffId = await seedStaff(businessId);
    await createLocation(businessId, { name: "Centro" });
    expect(await getBookableLocations(businessId)).toHaveLength(0); // solo 1

    await createLocation(businessId, { name: "Norte" });
    expect(await getBookableLocations(businessId)).toHaveLength(2);

    // Sin equipo activo, se degrada a agenda única (sin selector)
    await prisma.staffMember.update({
      where: { id: staffId },
      data: { active: false },
    });
    expect(await getBookableLocations(businessId)).toHaveLength(0);
  });

  it("la sede pre-filtra el equipo: solo atienden sus empleados y los de todas", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const anna = await seedStaff(businessId); // sede Centro
    const bruno = await seedStaff(businessId); // sede Norte
    const carla = await seedStaff(businessId); // todas las sedes
    const centro = await createLocation(businessId, { name: "Centro" });
    const norte = await createLocation(businessId, { name: "Norte" });
    await prisma.staffMember.update({
      where: { id: anna },
      data: { locationId: centro.id },
    });
    await prisma.staffMember.update({
      where: { id: bruno },
      data: { locationId: norte.id },
    });

    const slots = await getAvailability({
      businessId,
      serviceId,
      dateISO: "2026-07-20",
      locationId: centro.id,
      now: NOW,
    });
    const staffOffered = new Set(slots.flatMap((s) => s.staffIds));
    expect(staffOffered.has(anna)).toBe(true);
    expect(staffOffered.has(carla)).toBe(true); // "todas las sedes"
    expect(staffOffered.has(bruno)).toBe(false); // es de la otra sede
  });

  it("cita manual: pedir sede + empleado de OTRA sede no ofrece huecos", async () => {
    const { businessId, serviceId } = await seedBusiness();
    const anna = await seedStaff(businessId);
    const bruno = await seedStaff(businessId);
    const centro = await createLocation(businessId, { name: "Centro" });
    const norte = await createLocation(businessId, { name: "Norte" });
    await prisma.staffMember.update({
      where: { id: anna },
      data: { locationId: centro.id },
    });
    await prisma.staffMember.update({
      where: { id: bruno },
      data: { locationId: norte.id },
    });

    // Combinación del formulario de cita manual: sede Centro + Bruno (Norte)
    await expect(
      getAvailability({
        businessId,
        serviceId,
        dateISO: "2026-07-20",
        staffId: bruno,
        locationId: centro.id,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "STAFF_NOT_AVAILABLE" });

    // La combinación coherente sí ofrece huecos
    const slots = await getAvailability({
      businessId,
      serviceId,
      dateISO: "2026-07-20",
      staffId: anna,
      locationId: centro.id,
      now: NOW,
    });
    expect(slots.length).toBeGreaterThan(0);
  });

  it("la agenda del día expone la sede de cada cita", async () => {
    const { businessId, serviceId } = await seedBusiness();
    await seedStaff(businessId);
    const centro = await createLocation(businessId, { name: "Centro" });
    const clientId = await seedClient();

    await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-20", "10:00"),
      locationId: centro.id,
      now: NOW,
    });

    const agenda = await getDayAgenda(businessId, "2026-07-20");
    expect(agenda).toHaveLength(1);
    expect(agenda[0].location?.name).toBe("Centro");
  });

  it("la cita guarda la sede y valida que sea del negocio", async () => {
    const { businessId, serviceId } = await seedBusiness();
    await seedStaff(businessId);
    const centro = await createLocation(businessId, { name: "Centro" });
    const clientId = await seedClient();

    const appointment = await createAppointment({
      businessId,
      serviceId,
      clientId,
      startAt: slotAt("2026-07-20", "10:00"),
      locationId: centro.id,
      now: NOW,
    });
    expect(appointment.locationId).toBe(centro.id);

    // Sede de OTRO negocio → 404 (aislamiento multi-tenant)
    const other = await seedBusiness();
    await seedStaff(other.businessId);
    const ajena = await createLocation(other.businessId, { name: "Ajena" });
    await expect(
      createAppointment({
        businessId,
        serviceId,
        clientId,
        startAt: slotAt("2026-07-21", "10:00"),
        locationId: ajena.id,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND" });
  });
});
