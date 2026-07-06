"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, StickyNote, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface NoteView {
  id: string;
  text: string;
  authorName: string | null;
  createdAt: string;
}

const dateFmt = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
});

// Notas privadas del negocio sobre el cliente (preferencias, avisos...).
// Solo las ve el equipo del negocio, nunca el cliente.
export function ClientNotes({
  clientId,
  notes,
}: {
  clientId: string;
  notes: NoteView[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addNote(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/clients/${clientId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim() }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? "No se pudo guardar la nota");
      setBusy(false);
      return;
    }
    setText("");
    setBusy(false);
    router.refresh();
  }

  async function removeNote(noteId: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/admin/clients/${clientId}/notes/${noteId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? "No se pudo borrar la nota");
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
        <StickyNote className="h-4 w-4 text-ink-muted" aria-hidden />
        Notas privadas
      </h2>
      <p className="mt-1 text-xs text-ink-muted">
        Solo las ve tu equipo; el cliente nunca las verá.
      </p>

      <form onSubmit={addNote} className="mt-4 space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Preferencias, alergias, avisos…"
          className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <Button type="submit" size="sm" disabled={busy || !text.trim()}>
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : null}
          Añadir nota
        </Button>
      </form>

      {error && (
        <p className="mt-2 text-xs text-danger-strong" role="alert">
          {error}
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {notes.map((n) => (
          <li
            key={n.id}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2.5"
          >
            <p className="whitespace-pre-wrap text-sm text-ink">{n.text}</p>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <p className="text-xs text-ink-muted">
                {n.authorName ? `${n.authorName} · ` : ""}
                {dateFmt.format(new Date(n.createdAt))}
              </p>
              <button
                type="button"
                onClick={() => removeNote(n.id)}
                disabled={busy}
                aria-label="Borrar nota"
                className="text-ink-muted transition-colors hover:text-danger-strong"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </li>
        ))}
        {notes.length === 0 && (
          <li className="text-sm text-ink-muted">Aún no hay notas.</li>
        )}
      </ul>
    </Card>
  );
}
