"use client";

import { useState, type FormEvent } from "react";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo procesar la solicitud");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        Si existe una cuenta con ese email, te hemos enviado un enlace para
        restablecer la contraseña. Caduca en 30 minutos.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          Email de tu cuenta
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="input"
        />
      </div>
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? "Enviando…" : "Enviar enlace de restablecimiento"}
      </button>
    </form>
  );
}
