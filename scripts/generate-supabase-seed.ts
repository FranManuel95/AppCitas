import { writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import {
  addDaysISO,
  toLocalDateISO,
  wallTimeToUtc,
  weekdayOfDateISO,
} from "../src/lib/domain/dates";

// Genera un SQL de datos demo pensado para pegarse en el SQL Editor de
// Supabase (sin necesitar conexión directa al puerto 5432). Es una versión
// reducida de prisma/seed.ts: mismos negocios y credenciales, menos volumen
// de citas (unas ~2 semanas de histórico + próximas 2) para que el archivo
// sea manejable de copiar y pegar y siga poblando bien el dashboard.

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

function sqlStr(v: string | null | undefined): string {
  if (v === null || v === undefined) return "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}
function sqlTs(d: Date | null): string {
  return d ? `'${d.toISOString()}'` : "NULL";
}
function sqlBool(b: boolean): string {
  return b ? "true" : "false";
}

const TZ = "Europe/Madrid";
const now = new Date();
const todayISO = toLocalDateISO(now, TZ);
const lines: string[] = [];
function insert(table: string, cols: string[], values: string[]) {
  lines.push(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${values.join(", ")});`);
}

async function main() {
  const ownerHash = await bcrypt.hash("admin1234", 10);
  const clientHash = await bcrypt.hash("cliente1234", 10);
  const staffHash = await bcrypt.hash("staff1234", 10);

  lines.push(
    "-- ============================================================================",
    "-- AppCitas · Datos demo para Supabase (pegar en SQL Editor y pulsar RUN)",
    "-- Requiere haber ejecutado antes scripts/supabase-bootstrap.sql.",
    "-- Crea 2 negocios de ejemplo con servicios, equipo, un cupón, un bono y un",
    "-- histórico reducido de citas (~2 semanas atrás + 2 adelante) para poder",
    "-- ver la app funcionando de inmediato.",
    "-- ============================================================================",
    "BEGIN;",
    "",
  );

  // --- Negocios ---------------------------------------------------------
  const aurora = "seed_biz_aurora";
  const barberia = "seed_biz_barberia";

  insert(
    "Business",
    ["id", "slug", "name", "description", "category", "timezone", "currency", "address", "phone", "email", "cancellationWindowHours", "lateCancellationFeePercent", "slotGranularityMinutes", "maxAdvanceBookingDays", "minNoticeMinutes", "requireCardToBook", "remindersEnabled", "reminderHoursBefore", "notifyByEmail", "notifyBySms", "notifyByWhatsapp", "taxPercent", "active", "createdAt", "updatedAt"],
    [sqlStr(aurora), sqlStr("estudio-aurora"), sqlStr("Estudio Aurora"), sqlStr("Espacio multidisciplinar de sesiones y consultas personalizadas."), sqlStr("general"), sqlStr(TZ), sqlStr("EUR"), sqlStr("Calle Mayor 12, Sevilla"), sqlStr("+34 954 000 111"), sqlStr("hola@estudioaurora.example"), "24", "100", "30", "60", "60", sqlBool(false), sqlBool(true), "26", sqlBool(true), sqlBool(false), sqlBool(true), "0", sqlBool(true), sqlTs(now), sqlTs(now)],
  );
  insert(
    "Business",
    ["id", "slug", "name", "description", "category", "timezone", "currency", "address", "phone", "cancellationWindowHours", "lateCancellationFeePercent", "slotGranularityMinutes", "maxAdvanceBookingDays", "minNoticeMinutes", "requireCardToBook", "remindersEnabled", "reminderHoursBefore", "notifyByEmail", "notifyBySms", "notifyByWhatsapp", "taxPercent", "active", "createdAt", "updatedAt"],
    [sqlStr(barberia), sqlStr("barberia-norte"), sqlStr("Barbería Norte"), sqlStr("Corte y arreglo de barba con cita previa."), sqlStr("belleza"), sqlStr(TZ), sqlStr("EUR"), sqlStr("Av. de la Constitución 3, Madrid"), sqlStr("+34 910 222 333"), "24", "50", "15", "30", "30", sqlBool(false), sqlBool(true), "25", sqlBool(true), sqlBool(false), sqlBool(true), "0", sqlBool(true), sqlTs(now), sqlTs(now)],
  );

  // --- Horario semanal ----------------------------------------------------
  let hourSeq = 0;
  function addHours(businessId: string, weekday: number, openTime: string, closeTime: string) {
    const id = `seed_bh_${++hourSeq}`;
    insert("BusinessHour", ["id", "businessId", "weekday", "openTime", "closeTime"], [sqlStr(id), sqlStr(businessId), String(weekday), sqlStr(openTime), sqlStr(closeTime)]);
  }
  for (const wd of [1, 2, 3, 4, 5]) {
    addHours(aurora, wd, "09:00", "14:00");
    addHours(aurora, wd, "16:00", "20:00");
  }
  addHours(aurora, 6, "10:00", "14:00");
  for (const wd of [1, 2, 3, 4, 5, 6]) addHours(barberia, wd, "10:00", "19:00");

  // --- Servicios ------------------------------------------------------------
  const svcConsulta = "seed_svc_consulta";
  const svcEstandar = "seed_svc_estandar";
  const svcPremium = "seed_svc_premium";
  const svcCorte = "seed_svc_corte";
  const svcCorteBarba = "seed_svc_corte_barba";

  function addService(id: string, businessId: string, name: string, desc: string | null, duration: number, price: number, color: string) {
    insert("Service", ["id", "businessId", "name", "description", "durationMinutes", "priceCents", "color", "active", "createdAt", "updatedAt"], [sqlStr(id), sqlStr(businessId), sqlStr(name), sqlStr(desc), String(duration), String(price), sqlStr(color), sqlBool(true), sqlTs(now), sqlTs(now)]);
  }
  addService(svcConsulta, aurora, "Consulta inicial", "Primera toma de contacto y evaluación.", 30, 2500, "#6366f1");
  addService(svcEstandar, aurora, "Sesión estándar", "Sesión individual de una hora.", 60, 4500, "#0ea5e9");
  addService(svcPremium, aurora, "Sesión premium", "Sesión extendida de hora y media.", 90, 7000, "#f59e0b");
  addService(svcCorte, barberia, "Corte de pelo", null, 30, 1500, "#10b981");
  addService(svcCorteBarba, barberia, "Corte + barba", null, 45, 2200, "#8b5cf6");

  // --- Usuarios (antes que StaffMember: el equipo puede referenciar un userId) --
  const staffAna = "seed_staff_ana";
  const staffBruno = "seed_staff_bruno";
  const staffCarla = "seed_staff_carla";
  const staffBraulio = "seed_staff_braulio";
  const staffDiego = "seed_staff_diego";
  const userAna = "seed_user_staff_ana";

  function addUser(id: string, email: string, hash: string, name: string, role: string, businessId: string | null, phone: string | null = null) {
    insert(
      "User",
      ["id", "email", "passwordHash", "name", "phone", "role", "businessId", "emailVerifiedAt", "sessionVersion", "createdAt", "updatedAt"],
      [sqlStr(id), sqlStr(email), sqlStr(hash), sqlStr(name), sqlStr(phone), sqlStr(role), sqlStr(businessId), sqlTs(now), "0", sqlTs(now), sqlTs(now)],
    );
  }
  addUser("seed_user_owner_aurora", "admin@demo.com", ownerHash, "Ana Propietaria", "OWNER", aurora);
  addUser("seed_user_owner_barberia", "barberia@demo.com", ownerHash, "Braulio Norte", "OWNER", barberia);
  addUser(userAna, "ana@demo.com", staffHash, "Ana García", "STAFF", aurora);

  const demoClient = "seed_user_client_demo";
  addUser(demoClient, "cliente@demo.com", clientHash, "Carlos Cliente", "CLIENT", null, "+34 600 111 222");

  const clientNames = ["Lucía Fernández", "Miguel Ángel Ruiz", "Sofía Martín", "Javier Ortega", "Elena Navarro", "Pablo Iglesias", "María Dolores Gil", "Andrés Camacho", "Rocío Herrera", "Daniel Vega"];
  const clientIds = [demoClient];
  clientNames.forEach((name, i) => {
    const id = `seed_user_client_${i + 1}`;
    clientIds.push(id);
    addUser(id, `cliente${i + 1}@demo.com`, clientHash, name, "CLIENT", null, i % 3 === 2 ? null : `+34 6${String(10000000 + i * 111111).slice(0, 8)}`);
  });

  // --- Equipo -----------------------------------------------------------
  function addStaff(id: string, businessId: string, name: string, email: string | null, color: string, userId: string | null = null) {
    insert("StaffMember", ["id", "businessId", "name", "email", "color", "active", "userId", "createdAt", "updatedAt"], [sqlStr(id), sqlStr(businessId), sqlStr(name), sqlStr(email), sqlStr(color), sqlBool(true), sqlStr(userId), sqlTs(now), sqlTs(now)]);
  }
  addStaff(staffAna, aurora, "Ana García", "ana@estudioaurora.example", "#6366f1", userAna);
  addStaff(staffBruno, aurora, "Bruno Pérez", "bruno@estudioaurora.example", "#0ea5e9");
  addStaff(staffCarla, aurora, "Carla Ruiz", "carla@estudioaurora.example", "#f59e0b");
  addStaff(staffBraulio, barberia, "Braulio Norte", null, "#10b981");
  addStaff(staffDiego, barberia, "Diego Sanz", null, "#8b5cf6");

  // Carla: solo mañanas, solo sesiones (no consultas iniciales)
  let staffHourSeq = 0;
  for (const wd of [1, 2, 3, 4, 5]) {
    const id = `seed_sh_${++staffHourSeq}`;
    insert("StaffHour", ["id", "staffId", "weekday", "openTime", "closeTime"], [sqlStr(id), sqlStr(staffCarla), String(wd), sqlStr("09:00"), sqlStr("14:00")]);
  }
  insert("StaffService", ["staffId", "serviceId"], [sqlStr(staffCarla), sqlStr(svcEstandar)]);
  insert("StaffService", ["staffId", "serviceId"], [sqlStr(staffCarla), sqlStr(svcPremium)]);

  // --- Promociones --------------------------------------------------------
  insert("Package", ["id", "businessId", "serviceId", "name", "sessions", "priceCents", "validityDays", "active", "createdAt", "updatedAt"], [sqlStr("seed_pkg_bono5"), sqlStr(aurora), sqlStr(svcEstandar), sqlStr("Bono 5 sesiones"), "5", "20000", "90", sqlBool(true), sqlTs(now), sqlTs(now)]);
  insert("Coupon", ["id", "businessId", "code", "type", "value", "active", "timesRedeemed", "createdAt", "updatedAt"], [sqlStr("seed_cpn_bienvenida"), sqlStr(aurora), sqlStr("BIENVENIDA10"), sqlStr("PERCENT"), "10", sqlBool(true), "0", sqlTs(now), sqlTs(now)]);
  insert("Coupon", ["id", "businessId", "code", "type", "value", "active", "maxRedemptions", "timesRedeemed", "createdAt", "updatedAt"], [sqlStr("seed_cpn_corte5"), sqlStr(barberia), sqlStr("CORTE5"), sqlStr("FIXED"), "500", sqlBool(true), "50", "0", sqlTs(now), sqlTs(now)]);
  insert("ClientPackage", ["id", "businessId", "packageId", "clientId", "remainingSessions", "expiresAt", "pricePaidCents", "paymentStatus", "createdAt", "updatedAt"], [sqlStr("seed_cpkg_demo"), sqlStr(aurora), sqlStr("seed_pkg_bono5"), sqlStr(demoClient), "3", sqlTs(new Date(now.getTime() + 60 * 24 * 3_600_000)), "20000", sqlStr("UNCOLLECTED"), sqlTs(now), sqlTs(now)]);

  // --- Citas: ~2 semanas de histórico + 2 semanas de futuro ----------------
  type Setup = { businessId: string; services: Array<{ id: string; duration: number; price: number }>; staff: Array<{ id: string; hours: Array<{ weekday: number; openTime: string; closeTime: string }>; onlyServiceIds: string[] }>; businessHours: Array<{ weekday: number; openTime: string; closeTime: string }>; granularity: number; lateFeePercent: number };

  const auroraHours = [1, 2, 3, 4, 5].flatMap((wd) => [{ weekday: wd, openTime: "09:00", closeTime: "14:00" }, { weekday: wd, openTime: "16:00", closeTime: "20:00" }]).concat([{ weekday: 6, openTime: "10:00", closeTime: "14:00" }]);
  const barberiaHours = [1, 2, 3, 4, 5, 6].map((wd) => ({ weekday: wd, openTime: "10:00", closeTime: "19:00" }));

  const setups: Setup[] = [
    {
      businessId: aurora,
      services: [{ id: svcConsulta, duration: 30, price: 2500 }, { id: svcEstandar, duration: 60, price: 4500 }, { id: svcPremium, duration: 90, price: 7000 }],
      staff: [
        { id: staffAna, hours: auroraHours, onlyServiceIds: [] },
        { id: staffBruno, hours: auroraHours, onlyServiceIds: [] },
        { id: staffCarla, hours: [1, 2, 3, 4, 5].map((wd) => ({ weekday: wd, openTime: "09:00", closeTime: "14:00" })), onlyServiceIds: [svcEstandar, svcPremium] },
      ],
      businessHours: auroraHours,
      granularity: 30,
      lateFeePercent: 100,
    },
    {
      businessId: barberia,
      services: [{ id: svcCorte, duration: 30, price: 1500 }, { id: svcCorteBarba, duration: 45, price: 2200 }],
      staff: [
        { id: staffBraulio, hours: barberiaHours, onlyServiceIds: [] },
        { id: staffDiego, hours: barberiaHours, onlyServiceIds: [] },
      ],
      businessHours: barberiaHours,
      granularity: 15,
      lateFeePercent: 50,
    },
  ];

  let apptSeq = 0;
  for (const setup of setups) {
    let dateISO = addDaysISO(todayISO, -14);
    const endISO = addDaysISO(todayISO, 14);

    while (dateISO <= endISO) {
      const weekday = weekdayOfDateISO(dateISO);
      const target = 2 + Math.floor(rand() * 3);
      const usedByStaff = new Map<string, Array<{ start: number; end: number }>>(setup.staff.map((s) => [s.id, []]));

      for (let k = 0; k < target; k++) {
        const service = pick(setup.services);
        const qualified = setup.staff.filter((s) => s.onlyServiceIds.length === 0 || s.onlyServiceIds.includes(service.id));
        if (qualified.length === 0) continue;
        const member = pick(qualified);
        const ranges = member.hours.filter((h) => h.weekday === weekday);
        if (ranges.length === 0) continue;
        const range = pick(ranges);

        const [oh, om] = range.openTime.split(":").map(Number);
        const [ch] = range.closeTime.split(":").map(Number);
        const openMin = oh * 60 + om;
        const closeMin = ch * 60;
        if (closeMin - openMin < service.duration) continue;

        const step = setup.granularity;
        const maxStart = closeMin - service.duration;
        const startMin = openMin + Math.floor((rand() * (maxStart - openMin)) / step) * step;
        const endMin = startMin + service.duration;
        const used = usedByStaff.get(member.id)!;
        if (used.some((u) => startMin < u.end && endMin > u.start)) continue;
        used.push({ start: startMin, end: endMin });

        const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
        const mm = String(startMin % 60).padStart(2, "0");
        const startAt = wallTimeToUtc(dateISO, `${hh}:${mm}`, TZ);
        const endAt = new Date(startAt.getTime() + service.duration * 60_000);
        const isPast = startAt.getTime() < now.getTime();

        let status = "CONFIRMED";
        let chargedCents = 0;
        let cancelledAt: Date | null = null;

        if (isPast) {
          const r = rand();
          if (r < 0.78) {
            status = "COMPLETED";
            chargedCents = service.price;
          } else if (r < 0.86) {
            status = "CANCELLED";
            cancelledAt = new Date(startAt.getTime() - 48 * 3_600_000);
          } else if (r < 0.94) {
            status = "CANCELLED_LATE";
            chargedCents = Math.round((service.price * setup.lateFeePercent) / 100);
            cancelledAt = new Date(startAt.getTime() - 5 * 3_600_000);
          } else {
            status = "NO_SHOW";
            chargedCents = Math.round((service.price * setup.lateFeePercent) / 100);
          }
        }

        const id = `seed_appt_${++apptSeq}`;
        const clientId = pick(clientIds);
        const confirmationToken = `seed_token_${apptSeq}`;
        insert(
          "Appointment",
          ["id", "businessId", "serviceId", "clientId", "staffId", "startAt", "endAt", "status", "priceCents", "discountCents", "chargedCents", "cancelledAt", "confirmationToken", "paymentStatus", "createdAt", "updatedAt"],
          [sqlStr(id), sqlStr(setup.businessId), sqlStr(service.id), sqlStr(clientId), sqlStr(member.id), sqlTs(startAt), sqlTs(endAt), sqlStr(status), String(service.price), "0", String(chargedCents), sqlTs(cancelledAt), sqlStr(confirmationToken), sqlStr("NONE"), sqlTs(now), sqlTs(now)],
        );
      }
      dateISO = addDaysISO(dateISO, 1);
    }
  }

  lines.push("", "COMMIT;", "", `-- Citas generadas: ${apptSeq}`);

  writeFileSync("scripts/supabase-seed.sql", lines.join("\n") + "\n");
  console.log(`scripts/supabase-seed.sql generado — ${apptSeq} citas, ${lines.length} líneas`);
}

main();
