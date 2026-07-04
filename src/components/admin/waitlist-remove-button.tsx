"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

// Botón para que el negocio quite una entrada de su lista de espera.
export function WaitlistRemoveButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    try {
      await fetch(`/api/admin/waitlist/${entryId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={loading}
      aria-label="Quitar de la lista de espera"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-danger/40 hover:text-danger-strong disabled:opacity-60"
    >
      <X className="h-3.5 w-3.5" aria-hidden />
      {loading ? "Quitando…" : "Quitar"}
    </button>
  );
}
