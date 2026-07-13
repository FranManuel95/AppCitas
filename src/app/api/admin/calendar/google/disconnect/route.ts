import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { disconnectCalendar } from "@/lib/calendar/google";
import { prisma } from "@/lib/prisma";

// POST /api/admin/calendar/google/disconnect — desconecta el calendario del
// negocio (revoca el token best-effort y borra conexión, eventos y jobs).
export const POST = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  const connection = await prisma.calendarConnection.findFirst({
    where: { businessId: admin.businessId, staffId: null },
    select: { id: true },
  });
  if (connection) await disconnectCalendar(connection.id);
  return NextResponse.json({ ok: true });
});
