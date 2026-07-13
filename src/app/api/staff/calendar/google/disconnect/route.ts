import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { apiRequireStaff } from "@/lib/auth/guards";
import { disconnectCalendar } from "@/lib/calendar/google";
import { prisma } from "@/lib/prisma";

// POST /api/staff/calendar/google/disconnect — el empleado desconecta su
// calendario.
export const POST = apiHandler(async () => {
  const staff = await apiRequireStaff();
  const connection = await prisma.calendarConnection.findFirst({
    where: { businessId: staff.businessId, staffId: staff.staffId },
    select: { id: true },
  });
  if (connection) await disconnectCalendar(connection.id);
  return NextResponse.json({ ok: true });
});
