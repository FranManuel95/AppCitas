import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { importServices, parseServicesCsv } from "@/lib/domain/import";
import { enforceRateLimit } from "@/lib/rate-limit";

const schema = z.object({ csv: z.string().min(1).max(500_000) });

// POST /api/admin/import/services — importa servicios desde un CSV
// (cabeceras: nombre, duracion en minutos, precio en euros).
export const POST = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  await enforceRateLimit(request, "import-csv", {
    limit: 10,
    windowMs: 60 * 60_000,
  });
  const { csv } = schema.parse(await request.json());

  const parsed = parseServicesCsv(csv);
  const result = await importServices(admin.businessId, parsed.rows);
  return NextResponse.json({
    ...result,
    skipped: parsed.errors,
    totalRows: parsed.rows.length + parsed.errors.length,
  });
});
