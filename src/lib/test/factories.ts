import { prisma } from "@/lib/prisma";

// Fábricas para los tests con BD (SQLite temporal, ver tests/setup/*). Crean el
// mínimo necesario para ejercitar la capa de dominio con efectos reales.
//
// Convenciones para que los huecos sean deterministas:
// - timezone "UTC" → la hora de pared coincide con el UTC persistido.
// - horario abierto los 7 días 00:00–23:59, granularidad 60 min, sin antelación
//   mínima ni límite de reserva → cualquier hora en punto es un hueco válido.

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

let seq = 0;
function uniq(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

export interface SeededBusiness {
  businessId: string;
  serviceId: string;
}

export async function seedBusiness(opts?: {
  priceCents?: number;
  durationMinutes?: number;
  timezone?: string;
}): Promise<SeededBusiness> {
  const business = await prisma.business.create({
    data: {
      slug: uniq("biz"),
      name: "Negocio de prueba",
      timezone: opts?.timezone ?? "UTC",
      currency: "EUR",
      active: true,
      slotGranularityMinutes: 60,
      minNoticeMinutes: 0,
      maxAdvanceBookingDays: 3650,
      hours: {
        create: ALL_WEEKDAYS.map((weekday) => ({
          weekday,
          openTime: "00:00",
          closeTime: "23:59",
        })),
      },
      services: {
        create: {
          name: "Servicio",
          durationMinutes: opts?.durationMinutes ?? 30,
          priceCents: opts?.priceCents ?? 1000,
          active: true,
        },
      },
    },
    include: { services: true },
  });
  return { businessId: business.id, serviceId: business.services[0].id };
}

export async function seedClient(): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `${uniq("client")}@test.local`,
      name: "Cliente de prueba",
      passwordHash: "x",
      role: "CLIENT",
    },
  });
  return user.id;
}

export async function seedStaff(
  businessId: string,
  opts?: { serviceIds?: string[] },
): Promise<string> {
  const staff = await prisma.staffMember.create({
    data: {
      businessId,
      name: "Profesional",
      active: true,
      hours: {
        create: ALL_WEEKDAYS.map((weekday) => ({
          weekday,
          openTime: "00:00",
          closeTime: "23:59",
        })),
      },
      ...(opts?.serviceIds
        ? { services: { create: opts.serviceIds.map((serviceId) => ({ serviceId })) } }
        : {}),
    },
  });
  return staff.id;
}

/** Instante UTC de un día/hora concretos (timezone del negocio = UTC). */
export function slotAt(dateISO: string, hhmm: string): Date {
  return new Date(`${dateISO}T${hhmm}:00.000Z`);
}

/** Borra todas las filas en orden seguro para FKs, para aislar tests dentro de un archivo. */
export async function resetDb(): Promise<void> {
  // De hojas a raíces respetando las claves foráneas.
  await prisma.notification.deleteMany();
  await prisma.review.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.invoiceCounter.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.clientPackage.deleteMany();
  await prisma.package.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.loyaltyCard.deleteMany();
  await prisma.loyaltyProgram.deleteMany();
  await prisma.processedWebhookEvent.deleteMany();
  await prisma.staffHour.deleteMany();
  await prisma.staffService.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.service.deleteMany();
  await prisma.businessHour.deleteMany();
  await prisma.closure.deleteMany();
  await prisma.authToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.business.deleteMany();
}
