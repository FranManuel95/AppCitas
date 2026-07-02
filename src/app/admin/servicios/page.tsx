import { prisma } from "@/lib/prisma";
import { requireBusinessAdmin } from "@/lib/auth/guards";
import { ServicesManager } from "@/components/admin/services-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Servicios" };

export default async function ServicesPage() {
  const admin = await requireBusinessAdmin();
  const [business, services] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: admin.businessId },
      select: { currency: true },
    }),
    prisma.service.findMany({
      where: { businessId: admin.businessId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Servicios</h1>
        <p className="text-sm text-slate-500">
          Lo que tus clientes pueden reservar: duración, precio y color de
          agenda.
        </p>
      </div>
      <ServicesManager
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          durationMinutes: s.durationMinutes,
          priceCents: s.priceCents,
          color: s.color,
          active: s.active,
        }))}
        currency={business.currency}
      />
    </div>
  );
}
