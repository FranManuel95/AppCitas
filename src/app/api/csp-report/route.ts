import { NextResponse } from "next/server";
import { logWarn } from "@/lib/logger";

// Recibe los informes de violación de la CSP (modo report-only). El navegador
// hace POST con application/csp-report o application/reports+json. Se loguean de
// forma concisa para observar qué rompería la CSP antes de forzarla. Endpoint
// anónimo por diseño (lo llama el navegador); nunca falla ni bloquea.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Formato clásico { "csp-report": {...} } o Reporting API (array de reports).
    const reports = Array.isArray(body) ? body : [body];
    for (const entry of reports.slice(0, 10)) {
      const report = entry?.["csp-report"] ?? entry?.body ?? entry ?? {};
      logWarn("csp.violation", {
        directive:
          report["violated-directive"] ?? report.effectiveDirective ?? null,
        blockedUri: report["blocked-uri"] ?? report.blockedURL ?? null,
        documentUri: report["document-uri"] ?? report.documentURL ?? null,
      });
    }
  } catch {
    // Un informe malformado no debe generar ruido de error.
  }
  // 204: el navegador no espera cuerpo.
  return new NextResponse(null, { status: 204 });
}
