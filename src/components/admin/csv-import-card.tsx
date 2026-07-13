"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, FileUp, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Importador CSV (clientes o servicios): lee el archivo en el navegador y lo
// envía como texto. Muestra el resumen (creados/reutilizados/omitidos con su
// motivo y línea) para que el negocio sepa exactamente qué entró.
export function CsvImportCard({
  kind,
  templateCsv,
  templateName,
}: {
  kind: "clients" | "services";
  templateCsv: string;
  templateName: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    created: number;
    reused?: number;
    skippedExisting?: number;
    skipped: Array<{ line: number; reason: string }>;
  } | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    setSummary(null);
    const csv = await file.text();
    const res = await fetch(`/api/admin/import/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo importar el archivo");
      return;
    }
    setSummary(json);
    router.refresh();
  }

  const title =
    kind === "clients" ? "Importar clientes desde CSV" : "Importar servicios desde CSV";
  const hint =
    kind === "clients"
      ? "Cabeceras aceptadas: nombre, email, teléfono, nacimiento (es/en; separador , o ;). Ideal para traerte tu cartera de Booksy o de un Excel."
      : "Cabeceras: nombre, duracion (minutos), precio (euros). Los servicios con nombre ya existente se omiten.";

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        <FileUp className="h-4 w-4 text-ink-muted" aria-hidden />
        {title}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">{hint}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
            e.target.value = "";
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" aria-hidden />
          {busy ? "Importando…" : "Elegir archivo CSV"}
        </Button>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(templateCsv)}`}
          download={templateName}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          Descargar plantilla
        </a>
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {summary && (
        <div className="mt-3 rounded-lg bg-success-soft px-3 py-2.5 text-sm text-success-strong">
          <p className="font-medium">
            {kind === "clients"
              ? `Importados: ${summary.created} nuevos, ${summary.reused ?? 0} ya existentes.`
              : `Importados: ${summary.created} nuevos, ${summary.skippedExisting ?? 0} ya existentes.`}
          </p>
          {summary.skipped.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-ink-soft">
              {summary.skipped.slice(0, 10).map((s) => (
                <li key={`${s.line}-${s.reason}`}>
                  Línea {s.line}: {s.reason}
                </li>
              ))}
              {summary.skipped.length > 10 && (
                <li>…y {summary.skipped.length - 10} más</li>
              )}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
