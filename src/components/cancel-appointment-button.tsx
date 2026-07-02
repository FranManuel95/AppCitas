"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/money";
import { fmt, type Dict } from "@/lib/i18n/shared";

// Botón de cancelación con confirmación explícita: si la cancelación es
// tardía, el cliente ve el cargo exacto antes de confirmar.
export function CancelAppointmentButton({
  appointmentId,
  startAt,
  windowHours,
  feePercent,
  priceCents,
  currency,
  t,
}: {
  appointmentId: string;
  startAt: string;
  windowHours: number;
  feePercent: number;
  priceCents: number;
  currency: string;
  t: Dict["myAppointments"];
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
      setError(json.error ?? t.cancelError);
      setBusy(false);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {t.cancelCta}
      </Button>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-4 text-sm",
        isLate ? "border-warning/30 bg-warning-soft" : "border-border bg-surface-2",
      )}
    >
      {isLate ? (
        <p className="flex items-start gap-2 text-warning-strong">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {fmt(t.cancelLate, {
              hours: windowHours,
              amount: formatCents(feeCents, currency),
            })}
          </span>
        </p>
      ) : (
        <p className="text-ink-soft">{t.cancelFree}</p>
      )}
      {error && <p className="mt-2 text-danger-strong">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="danger"
          size="sm"
          disabled={busy}
          onClick={confirmCancel}
        >
          {busy
            ? t.cancelling
            : isLate
              ? t.cancelConfirmLate
              : t.cancelConfirmFree}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          {t.goBack}
        </Button>
      </div>
    </div>
  );
}
