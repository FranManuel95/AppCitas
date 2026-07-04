"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Botón para borrarse de una entrada de la lista de espera (en "Mis citas").
export function WaitlistLeaveButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function leave() {
    setLoading(true);
    try {
      await fetch(`/api/waitlist/${entryId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={leave}
      disabled={loading}
      className="text-sm font-medium text-ink-muted transition-colors hover:text-danger-strong disabled:opacity-60"
    >
      {loading ? "Quitando…" : "Quitarme"}
    </button>
  );
}
