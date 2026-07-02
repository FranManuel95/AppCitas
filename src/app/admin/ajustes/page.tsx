import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { SettingsForm } from "@/components/admin/settings-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const admin = await requireBusinessAdmin();
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: admin.businessId },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Ajustes</h1>
        <p className="text-sm text-slate-500">
          Datos públicos y política de reservas del negocio.
        </p>
      </div>
      <SettingsForm
        business={{
          name: business.name,
          description: business.description,
          category: business.category,
          address: business.address,
          phone: business.phone,
          email: business.email,
          cancellationWindowHours: business.cancellationWindowHours,
          lateCancellationFeePercent: business.lateCancellationFeePercent,
          slotGranularityMinutes: business.slotGranularityMinutes,
          maxAdvanceBookingDays: business.maxAdvanceBookingDays,
          minNoticeMinutes: business.minNoticeMinutes,
        }}
      />
    </div>
  );
}
