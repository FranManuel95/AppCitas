import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { getDashboardStats } from "@/lib/domain/stats";
import { csvResponse, toCsv } from "@/lib/csv";

// GET /api/admin/export/revenue — resumen mensual de ingresos (12 meses).
export const GET = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  const stats = await getDashboardStats(admin.businessId);

  const csv = toCsv(
    [
      "Mes",
      "Citas totales",
      "Completadas",
      "Canceladas",
      "Cancelación tardía",
      "No presentados",
      "Ingresos por bonos (€)",
      "Ingresos totales (€)",
    ],
    stats.monthly.map((m) => [
      m.month,
      m.total,
      m.completed,
      m.cancelled,
      m.cancelledLate,
      m.noShow,
      (m.packageRevenueCents / 100).toFixed(2),
      (m.revenueCents / 100).toFixed(2),
    ]),
  );

  return csvResponse(
    `ingresos-${new Date().toISOString().slice(0, 10)}.csv`,
    csv,
  );
});
