import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { HoursEditor } from "@/components/admin/hours-editor";
import { SectionHeader } from "@/components/ui/section-header";

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
      <SectionHeader
        as="h1"
        title="Horario"
        description="Define cuándo se pueden reservar citas."
      />
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
