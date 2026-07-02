"use client";

import { useState } from "react";
import { formatCents } from "@/lib/money";

// Respuesta al recordatorio: "¿Vas a asistir?" con un toque. El "no" aplica
// la política de cancelación mostrando el cargo exacto antes de confirmar.
export function AttendanceForm({
  token,
  startAt,
  windowHours,
  feePercent,
  priceCents,
  currency,
  alreadyConfirmed,
}: {
  token: string;
  startAt: string;
  windowHours: number;
  feePercent: number;
  priceCents: number;
  currency: string;
  alreadyConfirmed: boolean;
}) {
  const [state, setState] = useState<
    | { step: "ask" }
    | { step: "confirm-no" }
    | { step: "done-yes" }
    | { step: "done-no"; late: boolean; chargedCents: number }
  >({ step: "ask" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deadline = new Date(
    new Date(startAt).getTime() - windowHours * 3_600_000,
  );
  const isLate = Date.now() > deadline.getTime();
  const feeCents = Math.round((priceCents * feePercent) / 100);

  async function respond(attending: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/confirmations/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attending }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo registrar tu respuesta");
      return;
    }
    if (attending) {
      setState({ step: "done-yes" });
    } else {
      setState({
        step: "done-no",
        late: !!json.late,
        chargedCents: json.chargedCents ?? 0,
      });
    }
  }

  if (state.step === "done-yes") {
    return (
      <div className="rounded-lg bg-emerald-50 p-4 text-center">
        <p className="text-lg font-semibold text-emerald-800">
          ¡Asistencia confirmada! 🎉
        </p>
        <p className="mt-1 text-sm text-emerald-700">Te esperamos.</p>
      </div>
    );
  }

  if (state.step === "done-no") {
    return (
      <div className="rounded-lg bg-slate-50 p-4 text-center">
        <p className="text-lg font-semibold text-slate-800">Cita cancelada</p>
        <p className="mt-1 text-sm text-slate-600">
          {state.chargedCents > 0
            ? `Se ha aplicado el cargo por cancelación tardía: ${formatCents(state.chargedCents, currency)}.`
            : "Cancelaste dentro de plazo: sin coste."}
        </p>
      </div>
    );
  }

  if (state.step === "confirm-no") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        {isLate ? (
          <p className="text-sm text-amber-800">
            El plazo de cancelación gratuita ({windowHours} h antes) ya pasó.
            Si cancelas ahora se aplicará un cargo de{" "}
            <strong>{formatCents(feeCents, currency)}</strong>.
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            Estás dentro de plazo: la cancelación es gratuita.
          </p>
        )}
        {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
        <div className="mt-3 flex justify-center gap-2">
          <button
            className="btn-danger"
            disabled={busy}
            onClick={() => respond(false)}
          >
            {busy
              ? "Cancelando…"
              : isLate
                ? "Cancelar y aceptar el cargo"
                : "Confirmar cancelación"}
          </button>
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => setState({ step: "ask" })}
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center">
      {alreadyConfirmed && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Ya confirmaste tu asistencia. Puedes cambiar tu respuesta:
        </p>
      )}
      <p className="font-medium text-slate-800">¿Vas a asistir a tu cita?</p>
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      <div className="mt-4 flex justify-center gap-3">
        <button
          className="btn-primary min-w-32"
          disabled={busy}
          onClick={() => respond(true)}
        >
          {busy ? "…" : "Sí, asistiré ✓"}
        </button>
        <button
          className="btn-secondary min-w-32"
          disabled={busy}
          onClick={() => setState({ step: "confirm-no" })}
        >
          No podré asistir
        </button>
      </div>
    </div>
  );
}
