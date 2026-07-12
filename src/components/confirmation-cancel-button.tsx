"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, XCircle } from "lucide-react";
import { fmt } from "@/lib/i18n/shared";
import { formatCents } from "@/lib/money";

export interface CancelLabels {
  cancelCta: string;
  cancelFree: string;
  cancelLate: string;
  cancelConfirm: string;
  cancelKeep: string;
  cancelError: string;
}

// Cancelación desde el enlace del email (sin sesión): mismo aviso de política
// que en "Mis citas". Dos pasos para evitar cancelaciones por pulsación
// accidental desde el móvil.
export function ConfirmationCancelButton({
  token,
  startAt,
  windowHours,
  feePercent,
  priceCents,
  currency,
  labels,
}: {
  token: string;
  startAt: string;
  windowHours: number;
  feePercent: number;
  priceCents: number;
  currency: string;
  labels: CancelLabels;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLate =
    new Date(startAt).getTime() - Date.now() < windowHours * 3_600_000;
  const feeCents = Math.round((priceCents * feePercent) / 100);

  async function cancel() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/confirmations/${token}/cancel`, {
      method: "POST",
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? labels.cancelError);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-3 w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-danger-strong transition-colors hover:border-danger/50 hover:bg-danger-soft"
      >
        {labels.cancelCta}
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-surface-2 p-4">
      <p
        className={`text-sm ${isLate ? "text-warning-strong" : "text-ink-soft"}`}
      >
        {isLate
          ? fmt(labels.cancelLate, {
              percent: feePercent,
              amount: formatCents(feeCents, currency),
            })
          : labels.cancelFree}
      </p>
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-danger px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-danger-strong disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <XCircle className="h-4 w-4" aria-hidden />
          )}
          {labels.cancelConfirm}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-3"
        >
          {labels.cancelKeep}
        </button>
      </div>
    </div>
  );
}
