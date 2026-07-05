"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Inicia (o reanuda) el onboarding de Stripe Connect del negocio: pide la URL a
 * la API y redirige. Lee ?estado=ok|refresh del retorno para dar feedback.
 */
export function ConnectActions({
  chargesEnabled,
  connected,
}: {
  chargesEnabled: boolean;
  connected: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const estado = searchParams.get("estado");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/connect", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !json.url) {
        setError(json.error ?? "No se ha podido continuar, inténtalo de nuevo.");
        setBusy(false);
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("No se ha podido conectar, inténtalo de nuevo.");
      setBusy(false);
    }
  }

  // Respaldo del webhook: consulta a Stripe el estado actual y recarga la vista.
  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/connect/refresh", { method: "POST" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "No se ha podido actualizar, inténtalo de nuevo.");
        setBusy(false);
        return;
      }
      router.refresh();
      setBusy(false);
    } catch {
      setError("No se ha podido conectar, inténtalo de nuevo.");
      setBusy(false);
    }
  }

  const label = chargesEnabled
    ? "Actualizar datos de cobro"
    : connected
      ? "Completar la verificación"
      : "Conectar cuenta de cobros";

  return (
    <div className="space-y-3">
      {estado === "ok" && chargesEnabled && (
        <div className="flex items-start gap-2.5 rounded-lg bg-success-soft px-3.5 py-2.5 text-sm text-success-strong">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>Tu cuenta de cobros está lista. Ya recibes los pagos directamente.</p>
        </div>
      )}
      {estado === "refresh" && (
        <div className="rounded-lg bg-surface-3 px-3.5 py-2.5 text-sm text-ink-soft">
          <p>El enlace de configuración caducó. Pulsa de nuevo para continuar.</p>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={chargesEnabled ? "secondary" : "primary"}
          onClick={go}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Banknote className="h-4 w-4" aria-hidden />
          )}
          {label}
        </Button>

        {/* Fallback si el webhook no actualizó el estado tras verificar. */}
        {connected && !chargesEnabled && (
          <Button variant="ghost" onClick={refresh} disabled={busy}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Actualizar estado
          </Button>
        )}
      </div>
    </div>
  );
}
