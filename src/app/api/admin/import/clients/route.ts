import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { importClients, parseClientsCsv } from "@/lib/domain/import";
import { enforceRateLimit } from "@/lib/rate-limit";

const schema = z.object({ csv: z.string().min(1).max(2_000_000) });

// POST /api/admin/import/clients — importa la cartera desde un CSV
// (cabeceras es/en: nombre, email, teléfono, nacimiento).
export const POST = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  await enforceRateLimit(request, "import-csv", {
    limit: 10,
    windowMs: 60 * 60_000,
  });
  const { csv } = schema.parse(await request.json());

  const parsed = parseClientsCsv(csv);
  const result = await importClients(admin.businessId, parsed.rows);
  return NextResponse.json({
    ...result,
    skipped: parsed.errors,
    totalRows: parsed.rows.length + parsed.errors.length,
  });
});
