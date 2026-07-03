"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, RotateCcw, UserX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Dict } from "@/lib/i18n/shared";

export type AppointmentActionsLabels = Pick<
  Dict["admin"]["actions"],
  "complete" | "noShow" | "cancelNoCharge" | "revert" | "updateError" | "cancelError"
>;

// Valores por defecto (español) para las páginas que aún no pasan `labels`.
const DEFAULT_LABELS: AppointmentActionsLabels = {
  complete: "Completar",
  noShow: "No presentado",
  cancelNoCharge: "Cancelar (sin cargo)",
  revert: "Revertir",
  updateError: "No se pudo actualizar",
  cancelError: "No se pudo cancelar",
};

// Acciones operativas del negocio sobre una cita. El cargo se recalcula en el
// servidor según el estado (completada = precio íntegro, no-show = % de la
// política, cancelación por parte del negocio = sin cargo).
export function AppointmentActions({
  appointmentId,
  status,
  isPast,
  endpointBase = "/api/admin/appointments",
  canCancel = true,
  labels = DEFAULT_LABELS,
}: {
  appointmentId: string;
  status: string;
  isPast: boolean;
  // El portal del empleado usa /api/staff/appointments (solo sus citas)
  endpointBase?: string;
  canCancel?: boolean;
  labels?: AppointmentActionsLabels;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`${endpointBase}/${appointmentId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? labels.updateError);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  async function cancelByBusiness() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/appointments/${appointmentId}/cancel`, {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? labels.cancelError);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === "CONFIRMED" && isPast && (
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => setStatus("COMPLETED")}
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            {labels.complete}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => setStatus("NO_SHOW")}
          >
            <UserX className="h-3.5 w-3.5" aria-hidden />
            {labels.noShow}
          </Button>
        </>
      )}
      {status === "CONFIRMED" && !isPast && canCancel && (
        <Button
          variant="secondary"
          size="sm"
          className="text-danger-strong hover:bg-danger-soft"
          disabled={busy}
          onClick={cancelByBusiness}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          {labels.cancelNoCharge}
        </Button>
      )}
      {(status === "COMPLETED" || status === "NO_SHOW") && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => setStatus("CONFIRMED")}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {labels.revert}
        </Button>
      )}
      {error && <span className="text-xs text-danger-strong">{error}</span>}
    </div>
  );
}
