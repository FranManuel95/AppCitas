import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { hashPassword } from "../src/lib/auth/password";
import {
  addDaysISO,
  toLocalDateISO,
  wallTimeToUtc,
  weekdayOfDateISO,
} from "../src/lib/domain/dates";
import { reminderMessage } from "../src/lib/notifications/templates";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  }),
});

// PRNG con semilla fija: el seed produce siempre el mismo dataset.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260702);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

const TZ = "Europe/Madrid";

async function main() {
  console.log("Limpiando base de datos…");
  await prisma.notification.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.staffService.deleteMany();
  await prisma.staffHour.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.closure.deleteMany();
  await prisma.businessHour.deleteMany();
  await prisma.service.deleteMany();
  await prisma.user.deleteMany();
  await prisma.business.deleteMany();

  console.log("Creando negocios…");
  const aurora = await prisma.business.create({
    data: {
      slug: "estudio-aurora",
      name: "Estudio Aurora",
      description:
        "Espacio multidisciplinar de sesiones y consultas personalizadas.",
      category: "general",
      timezone: TZ,
      currency: "EUR",
      address: "Calle Mayor 12, Sevilla",
      phone: "+34 954 000 111",
      email: "hola@estudioaurora.example",
      cancellationWindowHours: 24,
      lateCancellationFeePercent: 100,
      slotGranularityMinutes: 30,
      maxAdvanceBookingDays: 60,
      minNoticeMinutes: 60,
      remindersEnabled: true,
      reminderHoursBefore: 26,
      notifyByEmail: true,
      notifyByWhatsapp: true,
      hours: {
        create: [
          // L-V mañana y tarde
          ...[1, 2, 3, 4, 5].flatMap((weekday) => [
            { weekday, openTime: "09:00", closeTime: "14:00" },
            { weekday, openTime: "16:00", closeTime: "20:00" },
          ]),
          { weekday: 6, openTime: "10:00", closeTime: "14:00" },
        ],
      },
      services: {
        create: [
          {
            name: "Consulta inicial",
            description: "Primera toma de contacto y evaluación.",
            durationMinutes: 30,
            priceCents: 2500,
            color: "#6366f1",
          },
          {
            name: "Sesión estándar",
            description: "Sesión individual de una hora.",
            durationMinutes: 60,
            priceCents: 4500,
            color: "#0ea5e9",
          },
          {
            name: "Sesión premium",
            description: "Sesión extendida de hora y media.",
            durationMinutes: 90,
            priceCents: 7000,
            color: "#f59e0b",
          },
        ],
      },
    },
    include: { services: true },
  });

  const barberia = await prisma.business.create({
    data: {
      slug: "barberia-norte",
      name: "Barbería Norte",
      description: "Corte y arreglo de barba con cita previa.",
      category: "belleza",
      timezone: TZ,
      currency: "EUR",
      address: "Av. de la Constitución 3, Madrid",
      phone: "+34 910 222 333",
      cancellationWindowHours: 24,
      lateCancellationFeePercent: 50,
      slotGranularityMinutes: 15,
      maxAdvanceBookingDays: 30,
      minNoticeMinutes: 30,
      remindersEnabled: true,
      reminderHoursBefore: 25,
      notifyByEmail: true,
      notifyByWhatsapp: true,
      hours: {
        create: [1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          openTime: "10:00",
          closeTime: "19:00",
        })),
      },
      services: {
        create: [
          {
            name: "Corte de pelo",
            durationMinutes: 30,
            priceCents: 1500,
            color: "#10b981",
          },
          {
            name: "Corte + barba",
            durationMinutes: 45,
            priceCents: 2200,
            color: "#8b5cf6",
          },
        ],
      },
    },
    include: { services: true },
  });

  console.log("Creando equipo…");
  const [sesionEstandar, sesionPremium] = [
    aurora.services.find((s) => s.name === "Sesión estándar")!,
    aurora.services.find((s) => s.name === "Sesión premium")!,
  ];

  const auroraStaff = await Promise.all([
    prisma.staffMember.create({
      data: {
        businessId: aurora.id,
        name: "Ana García",
        email: "ana@estudioaurora.example",
        color: "#6366f1",
      },
      include: { hours: true, services: true },
    }),
    prisma.staffMember.create({
      data: {
        businessId: aurora.id,
        name: "Bruno Pérez",
        email: "bruno@estudioaurora.example",
        color: "#0ea5e9",
      },
      include: { hours: true, services: true },
    }),
    prisma.staffMember.create({
      data: {
        businessId: aurora.id,
        name: "Carla Ruiz",
        email: "carla@estudioaurora.example",
        color: "#f59e0b",
        // Solo mañanas y solo sesiones (no consultas iniciales)
        hours: {
          create: [1, 2, 3, 4, 5].map((weekday) => ({
            weekday,
            openTime: "09:00",
            closeTime: "14:00",
          })),
        },
        services: {
          create: [
            { serviceId: sesionEstandar.id },
            { serviceId: sesionPremium.id },
          ],
        },
      },
      include: { hours: true, services: true },
    }),
  ]);

  const barberiaStaff = await Promise.all([
    prisma.staffMember.create({
      data: {
        businessId: barberia.id,
        name: "Braulio Norte",
        color: "#10b981",
      },
      include: { hours: true, services: true },
    }),
    prisma.staffMember.create({
      data: {
        businessId: barberia.id,
        name: "Diego Sanz",
        color: "#8b5cf6",
      },
      include: { hours: true, services: true },
    }),
  ]);

  console.log("Creando promociones…");
  const bono5 = await prisma.package.create({
    data: {
      businessId: aurora.id,
      serviceId: sesionEstandar.id,
      name: "Bono 5 sesiones",
      sessions: 5,
      priceCents: 20000, // frente a 22500 sueltas
      validityDays: 90,
    },
  });
  await prisma.coupon.create({
    data: {
      businessId: aurora.id,
      code: "BIENVENIDA10",
      type: "PERCENT",
      value: 10,
    },
  });
  await prisma.coupon.create({
    data: {
      businessId: barberia.id,
      code: "CORTE5",
      type: "FIXED",
      value: 500,
      maxRedemptions: 50,
    },
  });

  console.log("Creando usuarios…");
  const now0 = new Date();
  const [ownerHash, clientHash] = await Promise.all([
    hashPassword("admin1234"),
    hashPassword("cliente1234"),
  ]);

  await prisma.user.create({
    data: {
      email: "admin@demo.com",
      passwordHash: ownerHash,
      name: "Ana Propietaria",
      role: "OWNER",
      businessId: aurora.id,
      emailVerifiedAt: now0,
    },
  });
  await prisma.user.create({
    data: {
      email: "barberia@demo.com",
      passwordHash: ownerHash,
      name: "Braulio Norte",
      role: "OWNER",
      businessId: barberia.id,
      emailVerifiedAt: now0,
    },
  });

  // Cuenta del portal del empleado para Ana García (staff demo)
  const staffUser = await prisma.user.create({
    data: {
      email: "ana@demo.com",
      passwordHash: await hashPassword("staff1234"),
      name: "Ana García",
      role: "STAFF",
      businessId: aurora.id,
      emailVerifiedAt: now0,
    },
  });
  await prisma.staffMember.update({
    where: { id: auroraStaff[0].id },
    data: { userId: staffUser.id },
  });

  const demoClient = await prisma.user.create({
    data: {
      email: "cliente@demo.com",
      passwordHash: clientHash,
      name: "Carlos Cliente",
      phone: "+34 600 111 222",
      role: "CLIENT",
      emailVerifiedAt: now0,
    },
  });

  // El cliente demo tiene un bono comprado con sesiones disponibles
  await prisma.clientPackage.create({
    data: {
      businessId: aurora.id,
      packageId: bono5.id,
      clientId: demoClient.id,
      remainingSessions: 3,
      expiresAt: new Date(now0.getTime() + 60 * 24 * 3_600_000),
      pricePaidCents: 20000,
      paymentStatus: "UNCOLLECTED",
    },
  });

  const clientNames = [
    "Lucía Fernández",
    "Miguel Ángel Ruiz",
    "Sofía Martín",
    "Javier Ortega",
    "Elena Navarro",
    "Pablo Iglesias",
    "María Dolores Gil",
    "Andrés Camacho",
    "Rocío Herrera",
    "Daniel Vega",
  ];
  const clients = [demoClient];
  for (const [i, name] of clientNames.entries()) {
    clients.push(
      await prisma.user.create({
        data: {
          email: `cliente${i + 1}@demo.com`,
          passwordHash: clientHash,
          name,
          // Dos de cada tres clientes tienen teléfono (para SMS/WhatsApp)
          phone: i % 3 === 2 ? null : `+34 6${String(10000000 + i * 111111).slice(0, 8)}`,
          role: "CLIENT",
          emailVerifiedAt: now0,
        },
      }),
    );
  }

  console.log("Generando citas de los últimos 11 meses y próximas 2 semanas…");
  const now = new Date();
  const todayISO = toLocalDateISO(now, TZ);

  const setups: Array<{
    business: typeof aurora;
    staff: Array<{
      id: string;
      hours: Array<{ weekday: number; openTime: string; closeTime: string }>;
      services: Array<{ serviceId: string }>;
    }>;
  }> = [
    { business: aurora, staff: auroraStaff },
    { business: barberia, staff: barberiaStaff },
  ];

  for (const { business, staff } of setups) {
    const businessHours = await prisma.businessHour.findMany({
      where: { businessId: business.id },
    });

    let dateISO = addDaysISO(todayISO, -335);
    const endISO = addDaysISO(todayISO, 14);

    while (dateISO <= endISO) {
      const weekday = weekdayOfDateISO(dateISO);
      // Intentos por día proporcionales al tamaño del equipo
      const target = (2 + Math.floor(rand() * 4)) * staff.length;
      // Ocupación por empleado para evitar solapamientos
      const usedByStaff = new Map<
        string,
        Array<{ start: number; end: number }>
      >(staff.map((m) => [m.id, []]));

      for (let k = 0; k < target; k++) {
        const service = pick(business.services);
        // Empleados cualificados para el servicio
        const qualified = staff.filter(
          (m) =>
            m.services.length === 0 ||
            m.services.some((x) => x.serviceId === service.id),
        );
        if (qualified.length === 0) continue;
        const member = pick(qualified);

        const memberRanges = (
          member.hours.length > 0 ? member.hours : businessHours
        ).filter((h) => h.weekday === weekday);
        if (memberRanges.length === 0) continue;
        const range = pick(memberRanges);

        const [oh, om] = range.openTime.split(":").map(Number);
        const [ch] = range.closeTime.split(":").map(Number);
        const openMin = oh * 60 + om;
        const closeMin = ch * 60;
        if (closeMin - openMin < service.durationMinutes) continue;

        const step = business.slotGranularityMinutes;
        const maxStart = closeMin - service.durationMinutes;
        const startMin =
          openMin + Math.floor((rand() * (maxStart - openMin)) / step) * step;
        const endMin = startMin + service.durationMinutes;

        const used = usedByStaff.get(member.id)!;
        if (used.some((u) => startMin < u.end && endMin > u.start)) {
          continue; // ese empleado ya está ocupado, se descarta el intento
        }
        used.push({ start: startMin, end: endMin });

        const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
        const mm = String(startMin % 60).padStart(2, "0");
        const startAt = wallTimeToUtc(dateISO, `${hh}:${mm}`, TZ);
        const endAt = new Date(
          startAt.getTime() + service.durationMinutes * 60_000,
        );

        const isPast = startAt.getTime() < now.getTime();
        let status = "CONFIRMED";
        let chargedCents = 0;
        let cancelledAt: Date | null = null;
        let paymentStatus = "NONE";

        if (isPast) {
          const r = rand();
          if (r < 0.78) {
            status = "COMPLETED";
            chargedCents = service.priceCents;
          } else if (r < 0.86) {
            status = "CANCELLED";
            cancelledAt = new Date(startAt.getTime() - 48 * 3_600_000);
          } else if (r < 0.94) {
            status = "CANCELLED_LATE";
            chargedCents = Math.round(
              (service.priceCents * business.lateCancellationFeePercent) / 100,
            );
            cancelledAt = new Date(startAt.getTime() - 5 * 3_600_000);
            paymentStatus = "UNCOLLECTED";
          } else {
            status = "NO_SHOW";
            chargedCents = Math.round(
              (service.priceCents * business.lateCancellationFeePercent) / 100,
            );
            paymentStatus = "UNCOLLECTED";
          }
        }

        const client = pick(clients);
        const appointment = await prisma.appointment.create({
          data: {
            businessId: business.id,
            serviceId: service.id,
            clientId: client.id,
            staffId: member.id,
            startAt,
            endAt,
            status,
            priceCents: service.priceCents,
            chargedCents,
            cancelledAt,
            paymentStatus,
          },
        });

        // Recordatorio programado para citas futuras (outbox pendiente)
        if (!isPast && status === "CONFIRMED" && business.remindersEnabled) {
          const remindAt = new Date(
            startAt.getTime() - business.reminderHoursBefore * 3_600_000,
          );
          if (remindAt.getTime() > now.getTime() + 5 * 60_000) {
            const staffName =
              staff.find((m) => m.id === member.id) === undefined
                ? null
                : (await prisma.staffMember.findUnique({
                    where: { id: member.id },
                    select: { name: true },
                  }))?.name;
            const message = reminderMessage({
              clientName: client.name,
              businessName: business.name,
              serviceName: service.name,
              staffName,
              startAt,
              timezone: TZ,
              currency: business.currency,
              priceCents: service.priceCents,
              cancellationWindowHours: business.cancellationWindowHours,
              lateCancellationFeePercent: business.lateCancellationFeePercent,
              confirmationUrl: `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/c/${appointment.confirmationToken}`,
            });
            const deliveries: Array<{ channel: string; recipient: string }> =
              [];
            if (business.notifyByEmail && client.email) {
              deliveries.push({ channel: "EMAIL", recipient: client.email });
            }
            if (business.notifyByWhatsapp && client.phone) {
              deliveries.push({ channel: "WHATSAPP", recipient: client.phone });
            }
            if (deliveries.length > 0) {
              await prisma.notification.createMany({
                data: deliveries.map((d) => ({
                  businessId: business.id,
                  appointmentId: appointment.id,
                  channel: d.channel,
                  template: "REMINDER",
                  recipient: d.recipient,
                  subject: message.subject,
                  body: message.body,
                  scheduledFor: remindAt,
                })),
              });
            }
          }
        }
      }
      dateISO = addDaysISO(dateISO, 1);
    }
  }

  const total = await prisma.appointment.count();
  const pendingNotifications = await prisma.notification.count({
    where: { status: "PENDING" },
  });
  console.log(
    `Seed completado: ${total} citas y ${pendingNotifications} recordatorios programados.`,
  );
  console.log("Credenciales demo:");
  console.log("  Dueño Estudio Aurora → admin@demo.com / admin1234");
  console.log("  Dueño Barbería Norte → barberia@demo.com / admin1234");
  console.log("  Empleada (portal) → ana@demo.com / staff1234");
  console.log("  Cliente → cliente@demo.com / cliente1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
