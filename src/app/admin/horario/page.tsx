import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { HoursEditor } from "@/components/admin/hours-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Horario" };

export default async function HoursPage() {
  const admin = await requireBusinessAdmin();
  const [hours, closures] = await Promise.all([
    prisma.businessHour.findMany({
      where: { businessId: admin.businessId },
      orderBy: [{ weekday: "asc" }, { openTime: "asc" }],
    }),
    prisma.closure.findMany({
      where: { businessId: admin.businessId },
      orderBy: { date: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Horario</h1>
        <p className="text-sm text-slate-500">
          Define cuándo se pueden reservar citas.
        </p>
      </div>
      <HoursEditor
        initialHours={hours.map((h) => ({
          weekday: h.weekday,
          openTime: h.openTime,
          closeTime: h.closeTime,
        }))}
        closures={closures.map((c) => ({
          id: c.id,
          date: c.date,
          reason: c.reason,
        }))}
      />
    </div>
  );
}
