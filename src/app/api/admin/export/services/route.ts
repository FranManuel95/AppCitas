import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { csvResponse, toCsv } from "@/lib/csv";

// GET /api/admin/export/services — CSV del catálogo de servicios del negocio.
// Parte del "exporta todos mis datos" (anti lock-in).
export const GET = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  const services = await prisma.service.findMany({
    where: { businessId: admin.businessId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      name: true,
      durationMinutes: true,
      priceCents: true,
      bufferBeforeMinutes: true,
      bufferAfterMinutes: true,
      active: true,
    },
  });

  const csv = toCsv(
    [
      "Servicio",
      "Duración (min)",
      "Precio (€)",
      "Margen antes (min)",
      "Margen después (min)",
      "Activo",
    ],
    services.map((s) => [
      s.name,
      s.durationMinutes,
      (s.priceCents / 100).toFixed(2),
      s.bufferBeforeMinutes,
      s.bufferAfterMinutes,
      s.active ? "sí" : "no",
    ]),
  );

  return csvResponse(
    `servicios-${new Date().toISOString().slice(0, 10)}.csv`,
    csv,
  );
});
