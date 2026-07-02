"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Field, Input } from "@/components/ui/field";

export interface ResetPasswordLabels {
  passwordLabel: string;
  repeatLabel: string;
  button: string;
  busy: string;
  done: string;
  loginCta: string;
  mismatch: string;
  errorFallback: string;
}

export function ResetPasswordForm({
  token,
  labels,
}: {
  token: string;
  labels: ResetPasswordLabels;
}) {
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
      setError(labels.mismatch);
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
      setError(json.error ?? labels.errorFallback);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg bg-success-soft px-3.5 py-3 text-sm text-success-strong">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{labels.done}</p>
        </div>
        <Link href="/login" className="btn-primary w-full">
          {labels.loginCta}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label={labels.passwordLabel} htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </Field>
      <Field label={labels.repeatLabel} htmlFor="confirm">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </Field>
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {busy ? labels.busy : labels.button}
      </button>
    </form>
  );
}
