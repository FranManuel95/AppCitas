import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runScheduledJobs } from "@/lib/jobs";

// /api/jobs/notifications — ejecuta las tareas programadas (src/lib/jobs.ts):
// drena el outbox de notificaciones y corre el resto de mantenimientos.
// Lo invocan el workflow de GitHub cada 5 min (camino primario), el cron de
// vercel.json (red de seguridad diaria) o el worker local (npm run worker).
// Protegido con CRON_SECRET para que nadie pueda dispararlo desde fuera.

// El drenaje puede procesar cientos de mensajes: sin esto, el límite por
// defecto de Vercel (10 s en Hobby) cortaría la ejecución a mitad.
export const maxDuration = 60;

async function handleCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-cron-secret");

  if (process.env.NODE_ENV === "production" && !secret) {
    return NextResponse.json(
      { error: "CRON_SECRET no configurado" },
      { status: 501 },
    );
  }
  // Comparación en tiempo constante (mismo criterio que marketing-token.ts):
  // el !== corto-circuita por carácter y en teoría filtra el secreto por timing.
  const a = Buffer.from(provided ?? "");
  const b = Buffer.from(secret ?? "");
  if (secret && (a.length !== b.length || !timingSafeEqual(a, b))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const result = await runScheduledJobs();
  return NextResponse.json(result);
}

export const POST = handleCron;
export const GET = handleCron;
