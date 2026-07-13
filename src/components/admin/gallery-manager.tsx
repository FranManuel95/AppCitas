"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Images, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface PhotoDTO {
  id: string;
  url: string;
  caption: string | null;
}

// Galería "Trabajos" de la página pública: fotos por URL externa https
// (Instagram/Drive/CDN propio), mismas reglas que el logo.
export function GalleryManager({ photos }: { photos: PhotoDTO[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim(), caption: caption.trim() || null }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "No se pudo añadir la foto");
      return;
    }
    setUrl("");
    setCaption("");
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    await fetch(`/api/admin/photos/${id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        <Images className="h-4 w-4 text-ink-muted" aria-hidden />
        Galería de trabajos
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Enseña tu trabajo en la página pública (sección "Trabajos"). Pega la
        URL https de cada foto (máx. 12); la app no almacena archivos.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-64 flex-1 text-sm text-ink-soft">
          URL de la foto
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/foto.jpg"
            className="input mt-1 w-full text-sm"
          />
        </label>
        <label className="min-w-48 text-sm text-ink-soft">
          Pie (opcional)
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={120}
            className="input mt-1 w-full text-sm"
          />
        </label>
        <Button size="sm" disabled={busy || !url.trim()} onClick={add}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Añadir
        </Button>
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {photos.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((p) => (
            <figure key={p.id} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.caption ?? "Trabajo"}
                loading="lazy"
                className="aspect-square w-full rounded-lg border border-border object-cover"
              />
              {p.caption && (
                <figcaption className="mt-1 truncate text-xs text-ink-muted">
                  {p.caption}
                </figcaption>
              )}
              <button
                type="button"
                onClick={() => remove(p.id)}
                disabled={busy}
                className="absolute right-1.5 top-1.5 rounded-md bg-surface/90 p-1.5 text-ink-muted opacity-0 shadow-sm transition-opacity hover:text-danger-strong group-hover:opacity-100"
                aria-label="Quitar foto"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </figure>
          ))}
        </div>
      )}
    </Card>
  );
}
