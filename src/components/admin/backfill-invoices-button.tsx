"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, History } from "lucide-react";
import { Button } from "@/components/ui/button";

// Al activar la facturación a mitad de año: emite las facturas de los cobros
// del año que aún no tengan una (fecha de emisión = hoy; la correlatividad es
// de emisión, no se retro-data).
export function BackfillInvoicesButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backfill: true }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo completar");
      return;
    }
    setMessage(
      json.issued > 0
        ? `Emitidas ${json.issued} facturas de cobros anteriores.`
        : "No había cobros pendientes de facturar.",
    );
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" disabled={busy} onClick={run}>
        <History className="h-3.5 w-3.5" aria-hidden />
        Facturar cobros anteriores del año
      </Button>
      {message && (
        <span className="text-xs font-medium text-success-strong">
          {message}
        </span>
      )}
      {error && (
        <span className="flex items-center gap-1 text-xs text-danger-strong">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          {error}
        </span>
      )}
    </div>
  );
}
