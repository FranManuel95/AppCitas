import { prisma } from "@/lib/prisma";
import { DomainError } from "./errors";

// Sedes del negocio. Reglas del corte mínimo:
// - Multi-sede exige EQUIPO: no se puede tener una 2ª sede activa sin
//   empleados activos (la sede es un filtro sobre el equipo; sin equipo la
//   agenda única no distingue sedes y el selector no aparece).
// - No se desactiva/borra una sede con empleados asignados (reasigna antes).
// - Horarios y cierres siguen siendo por negocio/empleado.

export interface LocationInput {
  name: string;
  address?: string | null;
  phone?: string | null;
}

async function assertMultiLocationAllowed(businessId: string): Promise<void> {
  const [activeLocations, activeStaff] = await Promise.all([
    prisma.location.count({ where: { businessId, active: true } }),
    prisma.staffMember.count({ where: { businessId, active: true } }),
  ]);
  if (activeLocations >= 1 && activeStaff === 0) {
    throw new DomainError(
      "Para tener varias sedes necesitas empleados activos: la sede determina qué parte del equipo atiende",
      "LOCATIONS_REQUIRE_STAFF",
      422,
    );
  }
}

export async function createLocation(businessId: string, input: LocationInput) {
  await assertMultiLocationAllowed(businessId);
  return prisma.location.create({
    data: {
      businessId,
      name: input.name.trim(),
      address: input.address?.trim() || null,
      phone: input.phone?.trim() || null,
    },
  });
}

export async function updateLocation(
  businessId: string,
  locationId: string,
  input: Partial<LocationInput> & { active?: boolean },
) {
  const location = await prisma.location.findFirst({
    where: { id: locationId, businessId },
  });
  if (!location) {
    throw new DomainError("Sede no encontrada", "LOCATION_NOT_FOUND", 404);
  }

  if (input.active === false) {
    const assigned = await prisma.staffMember.count({
      where: { businessId, locationId, active: true },
    });
    if (assigned > 0) {
      throw new DomainError(
        "Esta sede tiene empleados asignados: reasígnalos antes de desactivarla",
        "LOCATION_HAS_STAFF",
        409,
      );
    }
  }
  if (input.active === true && !location.active) {
    await assertMultiLocationAllowed(businessId);
  }

  return prisma.location.update({
    where: { id: locationId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.address !== undefined
        ? { address: input.address?.trim() || null }
        : {}),
      ...(input.phone !== undefined
        ? { phone: input.phone?.trim() || null }
        : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
}

/**
 * Sedes activas para el wizard público. El selector solo aparece con más de
 * una sede activa Y equipo activo (sin equipo, la agenda única las ignora).
 */
export async function getBookableLocations(businessId: string) {
  const [locations, activeStaff] = await Promise.all([
    prisma.location.findMany({
      where: { businessId, active: true },
      select: { id: true, name: true, address: true },
      orderBy: { name: "asc" },
    }),
    prisma.staffMember.count({ where: { businessId, active: true } }),
  ]);
  if (locations.length < 2 || activeStaff === 0) return [];
  return locations;
}
