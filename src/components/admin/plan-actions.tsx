"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Acciones de facturación del negocio. Según el estado actual muestra el botón
 * de mejora (checkout de Stripe) o el de gestión (portal de Stripe); ambos
 * piden la URL a la API y redirigen. Lee ?estado=ok|cancelado del retorno de
 * Stripe para confirmar o descartar el resultado.
 */
export function PlanActions({
  plan,
  subscriptionStatus,
}: {
  plan: string;
  subscriptionStatus: string;
}) {
  const searchParams = useSearchParams();
  const estado = searchParams.get("estado");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Pro activo": tiene una suscripción de pago viva (aunque esté en prueba o
  // con un pago pendiente). Si está cancelada, vuelve a ofrecerse la mejora.
  const proActive = plan === "pro" && subscriptionStatus !== "canceled";

  async function go(endpoint: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !json.url) {
        setError(json.error ?? "No se ha podido continuar, inténtalo de nuevo.");
        setBusy(false);
        return;
      }
      // El navegador se va a Stripe; mantenemos `busy` para no permitir dobles
      // clics durante la redirección.
      window.location.href = json.url;
    } catch {
      setError("No se ha podido conectar, inténtalo de nuevo.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {estado === "ok" && (
        <div className="flex items-start gap-2.5 rounded-lg bg-success-soft px-3.5 py-2.5 text-sm text-success-strong">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>Suscripción actualizada correctamente.</p>
        </div>
      )}
      {estado === "cancelado" && (
        <div className="rounded-lg bg-surface-3 px-3.5 py-2.5 text-sm text-ink-soft">
          <p>Has cancelado el proceso. No se ha realizado ningún cargo.</p>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}

      {proActive ? (
        <Button
          variant="secondary"
          onClick={() => go("/api/billing/portal")}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <CreditCard className="h-4 w-4" aria-hidden />
          )}
          Gestionar suscripción
        </Button>
      ) : (
        <Button onClick={() => go("/api/billing/checkout")} disabled={busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden />
          )}
          Mejorar a Pro
        </Button>
      )}
    </div>
  );
}
