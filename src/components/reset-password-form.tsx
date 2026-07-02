"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      setBusy(false);
      return;
    }

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo restablecer la contraseña");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Contraseña guardada. Ya puedes iniciar sesión.
        </p>
        <Link href="/login" className="btn-primary w-full">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">
          Nueva contraseña (mínimo 8 caracteres)
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          Repite la contraseña
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="input"
        />
      </div>
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
