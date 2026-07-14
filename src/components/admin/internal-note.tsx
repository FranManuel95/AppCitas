"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface InternalNoteLabels {
  label: string;
  add: string;
  edit: string;
  save: string;
  cancel: string;
  error: string;
}

// Nota interna del equipo sobre una cita concreta (solo panel del negocio;
// jamás llega al cliente). Colapsada por defecto para no ensuciar la agenda.
export function InternalNote({
  appointmentId,
  note,
  labels,
}: {
  appointmentId: string;
  note: string | null;
  labels: InternalNoteLabels;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/appointments/${appointmentId}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ internalNote: value.trim() || null }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? labels.error);
      setBusy(false);
      return;
    }
    setBusy(false);
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="mt-1.5 flex flex-wrap items-start gap-1.5">
        {note && (
          <p className="flex-1 basis-full rounded-md border border-amber-300/60 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-200">
            <StickyNote
              className="mr-1 inline h-3 w-3 align-[-1px]"
              aria-hidden
            />
            {labels.label}: {note}
          </p>
        )}
        <button
          type="button"
          className="text-xs font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          onClick={() => {
            setValue(note ?? "");
            setEditing(true);
          }}
        >
          {note ? labels.edit : labels.add}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1.5 space-y-1.5">
      <textarea
        className="input min-h-16 w-full text-sm"
        maxLength={1000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        aria-label={labels.label}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy} onClick={save}>
          {labels.save}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => setEditing(false)}
        >
          {labels.cancel}
        </Button>
        {error && (
          <span className="flex items-center gap-1 text-xs text-danger-strong">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden />
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
