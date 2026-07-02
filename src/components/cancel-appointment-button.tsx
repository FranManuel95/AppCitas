"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatCents } from "@/lib/money";

// Botón de cancelación con confirmación explícita: si la cancelación es
// tardía, el cliente ve el cargo exacto antes de confirmar.
export function CancelAppointmentButton({
  appointmentId,
  startAt,
  windowHours,
  feePercent,
  priceCents,
  currency,
}: {
  appointmentId: string;
  startAt: string;
  windowHours: number;
  feePercent: number;
  priceCents: number;
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deadline = new Date(
    new Date(startAt).getTime() - windowHours * 3_600_000,
  );
  const isLate = Date.now() > deadline.getTime();
  const feeCents = Math.round((priceCents * feePercent) / 100);

  async function confirmCancel() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/appointments/${appointmentId}/cancel`, {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "No se pudo cancelar la cita");
      setBusy(false);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        Cancelar cita
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      {isLate ? (
        <p className="text-amber-800">
          El plazo de cancelación gratuita ({windowHours} h antes) ya ha
          pasado. Si cancelas ahora se te cobrará{" "}
          <strong>{formatCents(feeCents, currency)}</strong>.
        </p>
      ) : (
        <p className="text-slate-600">
          Estás dentro del plazo: la cancelación es gratuita.
        </p>
      )}
      {error && <p className="mt-2 text-rose-700">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button className="btn-danger" disabled={busy} onClick={confirmCancel}>
          {busy
            ? "Cancelando…"
            : isLate
              ? "Cancelar y aceptar el cargo"
              : "Confirmar cancelación"}
        </button>
        <button
          className="btn-secondary"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Volver
        </button>
      </div>
    </div>
  );
}
