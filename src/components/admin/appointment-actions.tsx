"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Acciones operativas del negocio sobre una cita. El cargo se recalcula en el
// servidor según el estado (completada = precio íntegro, no-show = % de la
// política, cancelación por parte del negocio = sin cargo).
export function AppointmentActions({
  appointmentId,
  status,
  isPast,
}: {
  appointmentId: string;
  status: string;
  isPast: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/appointments/${appointmentId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "No se pudo actualizar");
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
      setError(json.error ?? "No se pudo cancelar");
      setBusy(false);
      return;
    }
    router.refresh();
  }

  const buttonClass =
    "rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === "CONFIRMED" && isPast && (
        <>
          <button
            className={buttonClass}
            disabled={busy}
            onClick={() => setStatus("COMPLETED")}
          >
            Completar
          </button>
          <button
            className={buttonClass}
            disabled={busy}
            onClick={() => setStatus("NO_SHOW")}
          >
            No presentado
          </button>
        </>
      )}
      {status === "CONFIRMED" && !isPast && (
        <button className={buttonClass} disabled={busy} onClick={cancelByBusiness}>
          Cancelar (sin cargo)
        </button>
      )}
      {(status === "COMPLETED" || status === "NO_SHOW") && (
        <button
          className={buttonClass}
          disabled={busy}
          onClick={() => setStatus("CONFIRMED")}
        >
          Revertir
        </button>
      )}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
