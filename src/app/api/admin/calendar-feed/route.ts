import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";

// Activa (o regenera, revocando la URL anterior) el feed iCal del negocio.
export const POST = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  const token = `cal_${randomBytes(24).toString("base64url")}`;
  await prisma.business.update({
    where: { id: admin.businessId },
    data: { icsFeedToken: token },
  });
  return NextResponse.json({ token });
});

// Desactiva el feed (la URL deja de funcionar).
export const DELETE = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  await prisma.business.update({
    where: { id: admin.businessId },
    data: { icsFeedToken: null },
  });
  return NextResponse.json({ deleted: true });
});
