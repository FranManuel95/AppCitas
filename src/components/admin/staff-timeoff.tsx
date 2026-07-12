"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, CalendarOff, Trash2 } from "lucide-react";
import type { Dict } from "@/lib/i18n/shared";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export type TimeOffLabels = Pick<
  Dict["admin"]["equipo"],
  | "timeOffTitle"
  | "timeOffHint"
  | "timeOffFrom"
  | "timeOffTo"
  | "timeOffReason"
  | "timeOffAdd"
  | "timeOffEmpty"
  | "timeOffDelete"
  | "timeOffError"
>;

interface TimeOffDTO {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

// Panel de ausencias de un empleado: lista + alta + borrado. Carga al abrirse
// (los datos no viajan con la página de equipo, que ya es pesada).
export function StaffTimeOffPanel({
  staffId,
  labels,
}: {
  staffId: string;
  labels: TimeOffLabels;
}) {
  const [items, setItems] = useState<TimeOffDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/admin/staff/${staffId}/timeoff`);
      const json = await res.json().catch(() => ({ timeOff: [] }));
      if (!cancelled) setItems(res.ok ? json.timeOff : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/staff/${staffId}/timeoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: String(data.get("startDate") ?? ""),
        endDate: String(data.get("endDate") ?? ""),
        reason: String(data.get("reason") ?? "").trim() || undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? labels.timeOffError);
      return;
    }
    setItems((prev) => [json.timeOff, ...(prev ?? [])]);
    form.reset();
  }

  async function remove(timeOffId: string) {
    const res = await fetch(`/api/admin/staff/${staffId}/timeoff/${timeOffId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setItems((prev) => (prev ?? []).filter((t) => t.id !== timeOffId));
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface-2 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-ink">
        <CalendarOff className="h-4 w-4 text-ink-muted" aria-hidden />
        {labels.timeOffTitle}
      </p>
      <p className="mt-1 text-xs text-ink-muted">{labels.timeOffHint}</p>

      <form onSubmit={add} className="mt-3 flex flex-wrap items-end gap-3">
        <Field label={labels.timeOffFrom} htmlFor={`to-start-${staffId}`}>
          <Input
            id={`to-start-${staffId}`}
            name="startDate"
            type="date"
            required
            className="max-w-40"
          />
        </Field>
        <Field label={labels.timeOffTo} htmlFor={`to-end-${staffId}`}>
          <Input
            id={`to-end-${staffId}`}
            name="endDate"
            type="date"
            required
            className="max-w-40"
          />
        </Field>
        <Field label={labels.timeOffReason} htmlFor={`to-reason-${staffId}`}>
          <Input
            id={`to-reason-${staffId}`}
            name="reason"
            maxLength={100}
            className="max-w-48"
          />
        </Field>
        <Button type="submit" size="sm" disabled={busy}>
          {labels.timeOffAdd}
        </Button>
      </form>
      {error && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <ul className="mt-3 space-y-1.5">
        {(items ?? []).map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-sm"
          >
            <span className="tabular-nums text-ink-soft">
              {t.startDate === t.endDate
                ? t.startDate
                : `${t.startDate} → ${t.endDate}`}
              {t.reason && (
                <span className="ml-2 text-ink-muted">· {t.reason}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-danger-strong transition-colors hover:bg-danger-soft"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              {labels.timeOffDelete}
            </button>
          </li>
        ))}
        {items && items.length === 0 && (
          <li className="text-sm text-ink-muted">{labels.timeOffEmpty}</li>
        )}
      </ul>
    </div>
  );
}
