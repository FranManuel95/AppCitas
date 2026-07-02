"use client";

import { useState } from "react";
import { formatCents } from "@/lib/money";
import { fmt, type Dict } from "@/lib/i18n/shared";

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
  t,
  tMy,
}: {
  token: string;
  startAt: string;
  windowHours: number;
  feePercent: number;
  priceCents: number;
  currency: string;
  alreadyConfirmed: boolean;
  t: Dict["confirmation"];
  tMy: Dict["myAppointments"];
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
      setError(json.error ?? t.respondError);
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
          {t.confirmedTitle}
        </p>
        <p className="mt-1 text-sm text-emerald-700">{t.confirmedText}</p>
      </div>
    );
  }

  if (state.step === "done-no") {
    return (
      <div className="rounded-lg bg-slate-50 p-4 text-center">
        <p className="text-lg font-semibold text-slate-800">
          {t.cancelledTitle}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {state.chargedCents > 0
            ? fmt(t.cancelledCharged, {
                amount: formatCents(state.chargedCents, currency),
              })
            : t.cancelledFree}
        </p>
      </div>
    );
  }

  if (state.step === "confirm-no") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        {isLate ? (
          <p className="text-sm text-amber-800">
            {fmt(tMy.cancelLate, {
              hours: windowHours,
              amount: formatCents(feeCents, currency),
            })}
          </p>
        ) : (
          <p className="text-sm text-slate-600">{tMy.cancelFree}</p>
        )}
        {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
        <div className="mt-3 flex justify-center gap-2">
          <button
            className="btn-danger"
            disabled={busy}
            onClick={() => respond(false)}
          >
            {busy
              ? tMy.cancelling
              : isLate
                ? tMy.cancelConfirmLate
                : tMy.cancelConfirmFree}
          </button>
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => setState({ step: "ask" })}
          >
            {tMy.goBack}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center">
      {alreadyConfirmed && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {t.alreadyConfirmed}
        </p>
      )}
      <p className="font-medium text-slate-800">{t.question}</p>
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      <div className="mt-4 flex justify-center gap-3">
        <button
          className="btn-primary min-w-32"
          disabled={busy}
          onClick={() => respond(true)}
        >
          {busy ? "…" : t.yes}
        </button>
        <button
          className="btn-secondary min-w-32"
          disabled={busy}
          onClick={() => setState({ step: "confirm-no" })}
        >
          {t.no}
        </button>
      </div>
    </div>
  );
}
