"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Banknote,
  CalendarClock,
  CreditCard,
  Repeat,
  RotateCcw,
  UserX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Dict } from "@/lib/i18n/shared";

export type AppointmentActionsLabels = Pick<
  Dict["admin"]["actions"],
  | "completeCash"
  | "completeCard"
  | "noShow"
  | "cancelNoCharge"
  | "revert"
  | "updateError"
  | "cancelError"
  | "cancelSeries"
  | "seriesCancelled"
>;

// Valores por defecto (español) para las páginas que aún no pasan `labels`.
const DEFAULT_LABELS: AppointmentActionsLabels = {
  completeCash: "Completar · efectivo",
  completeCard: "Completar · tarjeta",
  noShow: "No presentado",
  cancelNoCharge: "Cancelar (sin cargo)",
  revert: "Revertir",
  updateError: "No se pudo actualizar",
  cancelError: "No se pudo cancelar",
  cancelSeries: "Cancelar serie",
  seriesCancelled: "Serie cancelada ({n} citas)",
};

// Acciones operativas del negocio sobre una cita. El cargo se recalcula en el
// servidor según el estado (completada = precio íntegro, no-show = % de la
// política, cancelación por parte del negocio = sin cargo).
export function AppointmentActions({
  appointmentId,
  status,
  isPast,
  seriesId = null,
  endpointBase = "/api/admin/appointments",
  canCancel = true,
  labels = DEFAULT_LABELS,
}: {
  appointmentId: string;
  status: string;
  isPast: boolean;
  // Si la cita pertenece a una serie recurrente, ofrece cancelarla entera
  seriesId?: string | null;
  // El portal del empleado usa /api/staff/appointments (solo sus citas)
  endpointBase?: string;
  canCancel?: boolean;
  labels?: AppointmentActionsLabels;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [movingSeries, setMovingSeries] = useState(false);
  const [newStart, setNewStart] = useState("");

  async function moveSeries() {
    if (!seriesId || !newStart) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/appointments/series/${seriesId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startAt: new Date(newStart).toISOString() }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? labels.updateError);
      return;
    }
    setMovingSeries(false);
    setNotice(
      `Serie movida (${json.moved} citas${
        json.skipped?.length ? `, ${json.skipped.length} omitidas` : ""
      })`,
    );
    router.refresh();
  }

  async function cancelSeries() {
    if (!seriesId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/appointments/series/${seriesId}`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? labels.cancelError);
      setBusy(false);
      return;
    }
    setNotice(
      labels.seriesCancelled.replace("{n}", String(json.cancelled ?? 0)),
    );
    router.refresh();
  }

  async function setStatus(next: string, paymentMethod?: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`${endpointBase}/${appointmentId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        paymentMethod ? { status: next, paymentMethod } : { status: next },
      ),
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
            onClick={() => setStatus("COMPLETED", "CASH")}
          >
            <Banknote className="h-3.5 w-3.5" aria-hidden />
            {labels.completeCash}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => setStatus("COMPLETED", "CARD_TERMINAL")}
          >
            <CreditCard className="h-3.5 w-3.5" aria-hidden />
            {labels.completeCard}
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
        <>
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
          {seriesId && (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setMovingSeries((v) => !v)}
              >
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                Mover serie
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger-strong hover:bg-danger-soft"
                disabled={busy}
                onClick={cancelSeries}
              >
                <Repeat className="h-3.5 w-3.5" aria-hidden />
                {labels.cancelSeries}
              </Button>
            </>
          )}
        </>
      )}
      {movingSeries && (
        <span className="flex items-center gap-1.5">
          {/* Nuevo inicio de la PRÓXIMA cita; el resto se desplaza igual */}
          <input
            type="datetime-local"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
            className="input max-w-52 py-1 text-xs tabular-nums"
          />
          <Button size="sm" disabled={busy || !newStart} onClick={moveSeries}>
            Mover
          </Button>
        </span>
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
      {notice && (
        <span className="text-xs font-medium text-success-strong">
          {notice}
        </span>
      )}
    </div>
  );
}
