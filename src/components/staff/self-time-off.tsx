"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";

interface TimeOffDTO {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface SelfTimeOffLabels {
  title: string;
  hint: string;
  from: string;
  to: string;
  reason: string;
  add: string;
  remove: string;
  empty: string;
  error: string;
}

// Autogestión de ausencias del propio empleado desde su portal. La API acota
// todo a su staffId de sesión.
export function SelfTimeOff({
  initial,
  labels,
}: {
  initial: TimeOffDTO[];
  labels: SelfTimeOffLabels;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    setError(null);
    const res = await fetch("/api/personal/time-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: String(form.get("startDate") ?? ""),
        endDate: String(form.get("endDate") ?? ""),
        reason: String(form.get("reason") ?? "") || undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? labels.error);
      return;
    }
    formEl.reset();
    router.refresh();
  }

  async function remove(id: string) {
    await fetch("/api/personal/time-off", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  return (
    <Card>
      <p className="font-medium text-ink">{labels.title}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{labels.hint}</p>
      <form onSubmit={add} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink-soft">
          {labels.from}
          <input
            type="date"
            name="startDate"
            required
            className="mt-1 block rounded-md border border-border-strong bg-surface px-2 py-1 text-sm tabular-nums"
          />
        </label>
        <label className="text-xs text-ink-soft">
          {labels.to}
          <input
            type="date"
            name="endDate"
            required
            className="mt-1 block rounded-md border border-border-strong bg-surface px-2 py-1 text-sm tabular-nums"
          />
        </label>
        <label className="min-w-40 flex-1 text-xs text-ink-soft">
          {labels.reason}
          <input
            name="reason"
            className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-2 py-1 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          {labels.add}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-danger-strong">{error}</p>}
      <ul className="mt-4 space-y-2">
        {initial.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm"
          >
            <span className="tabular-nums text-ink-soft">
              {item.startDate} → {item.endDate}
              {item.reason && (
                <span className="ml-1.5 text-ink-muted">· {item.reason}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="text-xs text-danger-strong hover:underline"
            >
              {labels.remove}
            </button>
          </li>
        ))}
        {initial.length === 0 && (
          <li className="text-xs text-ink-muted">{labels.empty}</li>
        )}
      </ul>
    </Card>
  );
}
