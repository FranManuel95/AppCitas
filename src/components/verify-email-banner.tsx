"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";

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
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-strong">
      <span className="flex min-w-0 items-start gap-2.5">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>{l.text}</p>
      </span>
      {state === "sent" ? (
        <span className="font-medium text-success-strong">{l.resent}</span>
      ) : (
        <button
          className="shrink-0 rounded-lg border border-warning/40 bg-surface px-3 py-1.5 text-xs font-medium text-warning-strong shadow-xs transition-colors hover:border-warning/70 disabled:cursor-not-allowed disabled:opacity-50"
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
