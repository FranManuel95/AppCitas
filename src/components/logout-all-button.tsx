"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Revoca todas las sesiones del usuario (todos los dispositivos).
export function LogoutAllButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <button className="btn-secondary" onClick={() => setConfirming(true)}>
        Cerrar sesión en todos los dispositivos
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-600">
        Se cerrarán todas tus sesiones, incluida esta. ¿Continuar?
      </span>
      <button
        className="btn-danger"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await fetch("/api/auth/logout-all", { method: "POST" });
          router.push("/login");
          router.refresh();
        }}
      >
        {busy ? "Cerrando…" : "Sí, cerrar todas"}
      </button>
      <button
        className="btn-secondary"
        disabled={busy}
        onClick={() => setConfirming(false)}
      >
        Cancelar
      </button>
    </div>
  );
}
