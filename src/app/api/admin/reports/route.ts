import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { csvResponse, toCsv } from "@/lib/csv";
import {
  getPromotionsReport,
  getRetentionCohorts,
  getServiceReport,
  getStaffReport,
  resolveReportRange,
} from "@/lib/domain/reports";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  tipo: z.enum(["servicios", "cupones", "bonos", "cohortes", "empleados"]),
  desde: z.string().optional(),
  hasta: z.string().optional(),
});

// GET /api/admin/reports?tipo=…&desde=…&hasta=… — exporta un informe a CSV.
export const GET = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  const url = new URL(request.url);
  const { tipo, desde, hasta } = querySchema.parse({
    tipo: url.searchParams.get("tipo") ?? undefined,
    desde: url.searchParams.get("desde") ?? undefined,
    hasta: url.searchParams.get("hasta") ?? undefined,
  });

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: admin.businessId },
    select: { timezone: true, currency: true },
  });
  const range = resolveReportRange(desde, hasta, business.timezone);
  const suffix = `${range.fromISO}_${range.toISO}`;

  if (tipo === "cohortes") {
    const cohorts = await getRetentionCohorts(
      admin.businessId,
      new Date(),
      business.timezone,
    );
    return csvResponse(
      `cohortes-retencion.csv`,
      toCsv(
        ["Mes primera visita", "Clientes nuevos", "Repitieron (90 días)", "% retención"],
        cohorts.map((c) => [
          c.month,
          c.newClients,
          c.returned,
          c.retentionPercent ?? "",
        ]),
      ),
    );
  }

  if (tipo === "empleados") {
    const rows = await getStaffReport(admin.businessId, range);
    return csvResponse(
      `ingresos-empleados-${suffix}.csv`,
      toCsv(
        ["Profesional", "Citas completadas", "Ingresos", "% comisión", "Comisión"],
        rows.map((r) => [
          r.name,
          r.completed,
          formatCents(r.revenueCents, business.currency),
          r.commissionPercent ?? "",
          r.commissionPercent !== null
            ? formatCents(r.commissionCents, business.currency)
            : "",
        ]),
      ),
    );
  }

  if (tipo === "servicios") {
    const rows = await getServiceReport(admin.businessId, range);
    return csvResponse(
      `ventas-servicios-${suffix}.csv`,
      toCsv(
        ["Servicio", "Citas", "Completadas", "No-shows", "% no-show", "Ingresos", "Ticket medio"],
        rows.map((r) => [
          r.name,
          r.total,
          r.completed,
          r.noShows,
          r.noShowPercent ?? "",
          formatCents(r.revenueCents, business.currency),
          r.avgTicketCents !== null
            ? formatCents(r.avgTicketCents, business.currency)
            : "",
        ]),
      ),
    );
  }

  const { coupons, packages } = await getPromotionsReport(
    admin.businessId,
    range,
  );
  if (tipo === "cupones") {
    return csvResponse(
      `cupones-${suffix}.csv`,
      toCsv(
        ["Cupón", "Activo", "Usos", "Descuento concedido", "Ingresos generados"],
        coupons.map((c) => [
          c.code,
          c.active ? "sí" : "no",
          c.uses,
          formatCents(c.discountCents, business.currency),
          formatCents(c.revenueCents, business.currency),
        ]),
      ),
    );
  }
  return csvResponse(
    `bonos-${suffix}.csv`,
    toCsv(
      ["Bono", "Activo", "Vendidos", "Ingresos", "Sesiones vendidas", "Sesiones consumidas"],
      packages.map((p) => [
        p.name,
        p.active ? "sí" : "no",
        p.sold,
        formatCents(p.revenueCents, business.currency),
        p.sessionsTotal,
        p.sessionsUsed,
      ]),
    ),
  );
});
