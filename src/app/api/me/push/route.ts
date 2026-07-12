import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireUser } from "@/lib/auth/guards";

const subscribeSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({
    p256dh: z.string().min(10).max(300),
    auth: z.string().min(5).max(100),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.url().max(1000),
});

// GET — clave pública VAPID + si este usuario tiene algún dispositivo suscrito
export const GET = apiHandler(async () => {
  const user = await apiRequireUser();
  const count = await prisma.pushSubscription.count({
    where: { userId: user.id },
  });
  return NextResponse.json({
    publicKey: process.env.VAPID_PUBLIC_KEY ?? null,
    subscribed: count > 0,
  });
});

// POST — registra (o reasigna) la suscripción de este dispositivo
export const POST = apiHandler(async (request: Request) => {
  const user = await apiRequireUser();
  const data = subscribeSchema.parse(await request.json());

  // El endpoint identifica el dispositivo: si otro usuario lo registró antes
  // en este mismo navegador, pasa a ser del usuario actual.
  await prisma.pushSubscription.upsert({
    where: { endpoint: data.endpoint },
    create: {
      userId: user.id,
      endpoint: data.endpoint,
      p256dh: data.keys.p256dh,
      auth: data.keys.auth,
    },
    update: {
      userId: user.id,
      p256dh: data.keys.p256dh,
      auth: data.keys.auth,
    },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
});

// DELETE — da de baja este dispositivo
export const DELETE = apiHandler(async (request: Request) => {
  const user = await apiRequireUser();
  const data = unsubscribeSchema.parse(await request.json());
  await prisma.pushSubscription.deleteMany({
    where: { userId: user.id, endpoint: data.endpoint },
  });
  return NextResponse.json({ ok: true });
});
