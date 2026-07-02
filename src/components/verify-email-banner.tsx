"use client";

import { useState } from "react";

// Aviso persistente hasta verificar el email, con reenvío del enlace.
export interface VerifyBannerLabels {
  text: string;
  resend: string;
  resending: string;
  resent: string;
  error: string;
}

export function VerifyEmailBanner({
  email,
  labels,
}: {
  email: string;
  labels?: VerifyBannerLabels;
}) {
  const l: VerifyBannerLabels = labels ?? {
    text: `Verifica tu email (${email}) para asegurar tu cuenta. Revisa tu bandeja de entrada.`,
    resend: "Reenviar enlace",
    resending: "Enviando…",
    resent: "Enlace reenviado ✓",
    error: "Error, reintentar",
  };
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  async function resend() {
    setState("sending");
    const res = await fetch("/api/auth/send-verification", { method: "POST" });
    setState(res.ok ? "sent" : "error");
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <p>{l.text}</p>
      {state === "sent" ? (
        <span className="font-medium text-emerald-700">{l.resent}</span>
      ) : (
        <button
          className="font-medium underline hover:text-amber-900 disabled:opacity-50"
          disabled={state === "sending"}
          onClick={resend}
        >
          {state === "sending"
            ? l.resending
            : state === "error"
              ? l.error
              : l.resend}
        </button>
      )}
    </div>
  );
}
