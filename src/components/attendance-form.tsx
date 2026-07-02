"use client";

import { useState } from "react";
import {
  CalendarX2,
  Check,
  CheckCircle2,
  Info,
  TriangleAlert,
  X,
} from "lucide-react";
import { formatCents } from "@/lib/money";
import { fmt, type Dict } from "@/lib/i18n/shared";
import { Button } from "@/components/ui/button";

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
      <div className="flex flex-col items-center rounded-xl bg-success-soft px-4 py-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-success" aria-hidden />
        <p className="mt-2 text-lg font-semibold text-success-strong">
          {t.confirmedTitle}
        </p>
        <p className="mt-1 text-sm text-success-strong">{t.confirmedText}</p>
      </div>
    );
  }

  if (state.step === "done-no") {
    return (
      <div className="flex flex-col items-center rounded-xl bg-surface-3 px-4 py-6 text-center">
        <CalendarX2 className="h-8 w-8 text-ink-muted" aria-hidden />
        <p className="mt-2 text-lg font-semibold text-ink">
          {t.cancelledTitle}
        </p>
        <p className="mt-1 text-sm text-ink-soft">
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
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        {isLate ? (
          <div className="flex items-start gap-2.5 rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning-strong">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              {fmt(tMy.cancelLate, {
                hours: windowHours,
                amount: formatCents(feeCents, currency),
              })}
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">{tMy.cancelFree}</p>
        )}
        {error && (
          <p className="mt-3 text-sm font-medium text-danger-strong">{error}</p>
        )}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button
            variant="danger"
            className="w-full"
            disabled={busy}
            onClick={() => respond(false)}
          >
            {busy
              ? tMy.cancelling
              : isLate
                ? tMy.cancelConfirmLate
                : tMy.cancelConfirmFree}
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={() => setState({ step: "ask" })}
          >
            {tMy.goBack}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {alreadyConfirmed && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-info-soft px-3.5 py-3 text-sm text-info-strong">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{t.alreadyConfirmed}</p>
        </div>
      )}
      <p className="text-center text-base font-semibold text-ink">
        {t.question}
      </p>
      {error && (
        <p className="mt-2 text-center text-sm font-medium text-danger-strong">
          {error}
        </p>
      )}
      <div className="mt-4 grid gap-2.5">
        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-success/30 bg-success-soft px-4 py-3.5 text-base font-semibold text-success-strong shadow-xs transition-colors hover:border-success/60 hover:bg-success/15 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success"
          disabled={busy}
          onClick={() => respond(true)}
        >
          <Check className="h-5 w-5 shrink-0" aria-hidden />
          {busy ? "…" : t.yes}
        </button>
        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3.5 text-base font-semibold text-danger-strong shadow-xs transition-colors hover:border-danger/60 hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
          disabled={busy}
          onClick={() => setState({ step: "confirm-no" })}
        >
          <X className="h-5 w-5 shrink-0" aria-hidden />
          {t.no}
        </button>
      </div>
    </div>
  );
}
