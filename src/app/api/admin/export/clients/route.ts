import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { csvResponse, toCsv } from "@/lib/csv";
import { getBusinessClients } from "@/lib/domain/clients";

// GET /api/admin/export/clients — CSV de la cartera de clientes del negocio
// (mismas métricas que /admin/clientes). Parte del "exporta todos mis datos".
export const GET = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  const clients = await getBusinessClients(admin.businessId);

  const csv = toCsv(
    [
      "Nombre",
      "Email",
      "Teléfono",
      "Citas totales",
      "Completadas",
      "No-shows",
      "Cancelaciones tardías",
      "Gasto (€)",
      "Última visita",
      "Fiabilidad (%)",
    ],
    clients.map((c) => [
      c.name,
      c.email,
      c.phone ?? "",
      c.totalAppointments,
      c.completed,
      c.noShows,
      c.lateCancellations,
      (c.spentCents / 100).toFixed(2),
      c.lastVisit ? c.lastVisit.toISOString().slice(0, 10) : "",
      c.reliabilityPercent ?? "",
    ]),
  );

  return csvResponse(
    `clientes-${new Date().toISOString().slice(0, 10)}.csv`,
    csv,
  );
});
