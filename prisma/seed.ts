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
  await prisma.appointment.deleteMany();
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

  console.log("Creando usuarios…");
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
    },
  });
  await prisma.user.create({
    data: {
      email: "barberia@demo.com",
      passwordHash: ownerHash,
      name: "Braulio Norte",
      role: "OWNER",
      businessId: barberia.id,
    },
  });

  const demoClient = await prisma.user.create({
    data: {
      email: "cliente@demo.com",
      passwordHash: clientHash,
      name: "Carlos Cliente",
      phone: "+34 600 111 222",
      role: "CLIENT",
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
          role: "CLIENT",
        },
      }),
    );
  }

  console.log("Generando citas de los últimos 11 meses y próximas 2 semanas…");
  const now = new Date();
  const todayISO = toLocalDateISO(now, TZ);

  for (const business of [aurora, barberia]) {
    const hours = await prisma.businessHour.findMany({
      where: { businessId: business.id },
    });

    let dateISO = addDaysISO(todayISO, -335);
    const endISO = addDaysISO(todayISO, 14);

    while (dateISO <= endISO) {
      const weekday = weekdayOfDateISO(dateISO);
      const ranges = hours.filter((h) => h.weekday === weekday);
      if (ranges.length > 0) {
        // Ocupación variable por día (más densa en meses recientes)
        const target = 2 + Math.floor(rand() * 4);
        const usedIntervals: Array<{ start: number; end: number }> = [];

        for (let k = 0; k < target; k++) {
          const service = pick(business.services);
          const range = pick(ranges);
          const [oh, om] = range.openTime.split(":").map(Number);
          const [ch] = range.closeTime.split(":").map(Number);
          const openMin = oh * 60 + om;
          const closeMin = ch * 60;
          if (closeMin - openMin < service.durationMinutes) continue;

          const step = business.slotGranularityMinutes;
          const maxStart = closeMin - service.durationMinutes;
          const startMin =
            openMin +
            Math.floor((rand() * (maxStart - openMin)) / step) * step;
          const endMin = startMin + service.durationMinutes;

          if (
            usedIntervals.some((u) => startMin < u.end && endMin > u.start)
          ) {
            continue; // hueco ocupado, se descarta este intento
          }
          usedIntervals.push({ start: startMin, end: endMin });

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
                (service.priceCents * business.lateCancellationFeePercent) /
                  100,
              );
              cancelledAt = new Date(startAt.getTime() - 5 * 3_600_000);
            } else {
              status = "NO_SHOW";
              chargedCents = Math.round(
                (service.priceCents * business.lateCancellationFeePercent) /
                  100,
              );
            }
          }

          await prisma.appointment.create({
            data: {
              businessId: business.id,
              serviceId: service.id,
              clientId: pick(clients).id,
              startAt,
              endAt,
              status,
              priceCents: service.priceCents,
              chargedCents,
              cancelledAt,
            },
          });
        }
      }
      dateISO = addDaysISO(dateISO, 1);
    }
  }

  const total = await prisma.appointment.count();
  console.log(`Seed completado: ${total} citas creadas.`);
  console.log("Credenciales demo:");
  console.log("  Dueño Estudio Aurora → admin@demo.com / admin1234");
  console.log("  Dueño Barbería Norte → barberia@demo.com / admin1234");
  console.log("  Cliente → cliente@demo.com / cliente1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
