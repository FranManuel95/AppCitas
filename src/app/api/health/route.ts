import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformHealth } from "@/lib/domain/platform-health";

// Sonda de salud: debe consultar la BD EN TIEMPO DE EJECUCIÓN, nunca
// prerenderizarse en el build (ahí la BD puede no estar disponible y tumbaría
// el despliegue).
export const dynamic = "force-dynamic";

// GET /api/health — sonda para monitorización/orquestadores (Docker, uptime).
// Además de comprobar la BD, expone la frescura del cron y el backlog del
// outbox para que un monitor externo detecte que el cron dejó de dispararse.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }

  try {
    const health = await getPlatformHealth();
    // Cron obsoleto (>15 min sin correr) = degradado: el monitor externo alerta
    // por el 503. Si nunca corrió (recién desplegado), stale es false → 200.
    const ok = !health.cron.stale;
    return NextResponse.json(
      { ok, db: "up", cron: health.cron, outbox: health.outbox },
      { status: ok ? 200 : 503 },
    );
  } catch {
    // La BD respondió al SELECT 1: no degradamos por un fallo de la telemetría.
    return NextResponse.json({ ok: true, db: "up", cron: "unknown" });
  }
}
