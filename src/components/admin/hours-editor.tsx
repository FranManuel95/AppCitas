"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Plus, Trash2, X } from "lucide-react";
import { WEEKDAYS_ES, WEEKDAY_ORDER } from "@/lib/weekdays";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { SectionHeader } from "@/components/ui/section-header";

interface HourRange {
  weekday: number;
  openTime: string;
  closeTime: string;
}

interface ClosureDTO {
  id: string;
  date: string;
  reason: string | null;
}

export function HoursEditor({
  initialHours,
  closures,
}: {
  initialHours: HourRange[];
  closures: ClosureDTO[];
}) {
  const router = useRouter();
  const [hours, setHours] = useState<HourRange[]>(initialHours);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  function addRange(weekday: number) {
    setHours((h) => [
      ...h,
      { weekday, openTime: "09:00", closeTime: "18:00" },
    ]);
  }

  function updateRange(index: number, patch: Partial<HourRange>) {
    setHours((h) => h.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRange(index: number) {
    setHours((h) => h.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ kind: "error", text: json.error ?? "No se pudo guardar" });
    } else {
      setMessage({ kind: "ok", text: "Horario guardado" });
      router.refresh();
    }
    setSaving(false);
  }

  async function addClosure(formData: FormData) {
    const date = String(formData.get("date") ?? "");
    const reason = String(formData.get("reason") ?? "");
    const res = await fetch("/api/admin/closures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, reason: reason || undefined }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ kind: "error", text: json.error ?? "No se pudo añadir" });
      return;
    }
    setMessage(null);
    router.refresh();
  }

  async function removeClosure(id: string) {
    await fetch("/api/admin/closures", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeader
          title="Horario semanal"
          description="Varios tramos por día permitidos (p. ej. mañana y tarde)."
        />
        <div className="mt-5 space-y-4">
          {WEEKDAY_ORDER.map((weekday) => {
            const dayRanges = hours
              .map((r, index) => ({ ...r, index }))
              .filter((r) => r.weekday === weekday);
            return (
              <div
                key={weekday}
                className="flex flex-wrap items-start gap-3 border-b border-border pb-4 last:border-0 last:pb-0"
              >
                <span className="w-24 pt-1.5 text-sm font-medium text-ink">
                  {WEEKDAYS_ES[weekday]}
                </span>
                <div className="flex flex-1 flex-col gap-2">
                  {dayRanges.map((r) => (
                    <div key={r.index} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={r.openTime}
                        onChange={(e) =>
                          updateRange(r.index, { openTime: e.target.value })
                        }
                        className="max-w-32 py-1.5 tabular-nums"
                      />
                      <span className="text-ink-muted" aria-hidden>
                        –
                      </span>
                      <Input
                        type="time"
                        value={r.closeTime}
                        onChange={(e) =>
                          updateRange(r.index, { closeTime: e.target.value })
                        }
                        className="max-w-32 py-1.5 tabular-nums"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Quitar"
                        title="Quitar"
                        onClick={() => removeRange(r.index)}
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  ))}
                  {dayRanges.length === 0 && (
                    <p className="pt-1.5 text-sm text-ink-muted">Cerrado</p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => addRange(weekday)}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Tramo
                </Button>
              </div>
            );
          })}
        </div>
        {message && (
          <p
            className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
              message.kind === "ok"
                ? "bg-success-soft text-success-strong"
                : "bg-danger-soft text-danger-strong"
            }`}
          >
            {message.kind === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            {message.text}
          </p>
        )}
        <Button className="mt-4" disabled={saving} onClick={save}>
          {saving ? "Guardando…" : "Guardar horario"}
        </Button>
      </Card>

      <Card>
        <SectionHeader
          title="Cierres puntuales y festivos"
          description="Días concretos en los que no se aceptan reservas."
        />
        <form
          action={addClosure}
          className="mt-5 flex flex-wrap items-end gap-2"
        >
          <Field label="Fecha" htmlFor="closure-date">
            <Input
              id="closure-date"
              type="date"
              name="date"
              required
              className="tabular-nums"
            />
          </Field>
          <Field
            label="Motivo (opcional)"
            htmlFor="closure-reason"
            className="min-w-40 flex-1"
          >
            <Input
              id="closure-reason"
              name="reason"
              placeholder="Festivo, vacaciones…"
            />
          </Field>
          <Button type="submit" variant="secondary">
            Añadir cierre
          </Button>
        </form>
        <ul className="mt-4 space-y-2">
          {closures.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <span className="min-w-0 text-ink-soft">
                <span className="font-medium tabular-nums text-ink">
                  {c.date}
                </span>
                {c.reason && (
                  <span className="text-ink-muted"> · {c.reason}</span>
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-danger-strong hover:bg-danger-soft hover:text-danger-strong"
                onClick={() => removeClosure(c.id)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Eliminar
              </Button>
            </li>
          ))}
          {closures.length === 0 && (
            <li className="text-sm text-ink-muted">
              No hay cierres programados.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}
