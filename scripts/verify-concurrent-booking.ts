/**
 * Verificación manual del bloqueo anti doble-reserva contra PostgreSQL real.
 *
 * Bajo READ COMMITTED, dos reservas concurrentes del mismo hueco no se ven
 * entre sí en el chequeo de solapamiento y ambas insertarían. El
 * `pg_advisory_xact_lock` de src/lib/domain/locks.ts las serializa. SQLite no
 * reproduce el fallo (serializa de por sí), por eso esta prueba exige Postgres.
 *
 * Uso (con un Postgres local ya migrado y sembrado):
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/appcitas_deploy \
 *     npx tsx scripts/verify-concurrent-booking.ts
 *
 * Espera exactamente 1 reserva creada y N-1 rechazos SLOT_TAKEN/aforo.
 */
import { prisma } from "@/lib/prisma";
import { createAppointment, getAvailability } from "@/lib/domain/appointments";
import { DomainError } from "@/lib/domain/errors";

const CONCURRENCY = 8;

function nextWorkingMonday(minDays: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + minDays);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d;
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("postgres")) {
    throw new Error(
      "Esta verificación requiere DATABASE_URL de PostgreSQL (el lock es no-op en SQLite).",
    );
  }

  // Negocio con un solo profesional/silla para que solo quepa UNA reserva.
  const business = await prisma.business.findFirstOrThrow({
    where: { active: true },
    select: { id: true, slug: true, timezone: true },
  });
  const service = await prisma.service.findFirstOrThrow({
    where: { businessId: business.id, active: true },
    select: { id: true },
  });
  const client = await prisma.user.findFirstOrThrow({
    where: { role: "CLIENT" },
    select: { id: true },
  });

  const dateISO = nextWorkingMonday(14).toISOString().slice(0, 10);
  const slots = await getAvailability({
    businessId: business.id,
    serviceId: service.id,
    dateISO,
  });
  if (slots.length === 0) {
    throw new Error(`Sin huecos libres el ${dateISO} para ${business.slug}`);
  }
  const slot = slots[0];
  const startAt = slot.start;
  // Se fija un único profesional (o "sala" si el negocio no tiene equipo): la
  // capacidad del hueco es 1. Sin el lock, la carrera entre N peticiones
  // simultáneas crearía 2+ reservas del mismo hueco (doble reserva). Con el
  // lock, exactamente 1.
  const staffId = slot.staffIds.length > 0 ? slot.staffIds[0] : undefined;
  const capacity = 1;

  console.log(
    `Disparando ${CONCURRENCY} reservas concurrentes al hueco ${startAt.toISOString()} ` +
      `(negocio ${business.slug}, profesional ${staffId ?? "sala"})…`,
  );

  const results = await Promise.allSettled(
    Array.from({ length: CONCURRENCY }, () =>
      createAppointment({
        businessId: business.id,
        serviceId: service.id,
        clientId: client.id,
        startAt,
        staffId,
      }),
    ),
  );

  let created = 0;
  let rejected = 0;
  let unexpected = 0;
  for (const r of results) {
    if (r.status === "fulfilled") {
      created++;
    } else if (
      r.reason instanceof DomainError &&
      ["SLOT_TAKEN", "SLOT_UNAVAILABLE"].includes(r.reason.code)
    ) {
      rejected++;
    } else {
      unexpected++;
      console.error("  Rechazo inesperado:", r.reason);
    }
  }

  console.log(
    `Resultado: ${created} creada(s), ${rejected} rechazo(s) de hueco, ${unexpected} error(es) inesperado(s).`,
  );

  // La invariante que prueba el lock: nunca se crean más reservas que la
  // capacidad del hueco, aun con N peticiones simultáneas.
  const ok = created === capacity && unexpected === 0;
  console.log(
    ok
      ? "✅ Bloqueo anti doble-reserva OK (sin sobre-reserva)"
      : `❌ FALLO: se crearon ${created}, se esperaban ${capacity}`,
  );
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
