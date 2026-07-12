import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Sonda de salud: debe consultar la BD EN TIEMPO DE EJECUCIÓN, nunca
// prerenderizarse en el build (ahí la BD puede no estar disponible y tumbaría
// el despliegue).
export const dynamic = "force-dynamic";

// GET /api/health — sonda para monitorización/orquestadores (Docker, uptime).
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up" });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
