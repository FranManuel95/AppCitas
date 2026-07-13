"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Copy, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

// Activación de la verificación en dos pasos (TOTP) desde Ajustes → Seguridad.
// (Superficie de admin: literales en español, como el resto de esa sección.)
export function TwoFactorSetup() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Se muestran UNA sola vez (tras activar o regenerar); no vuelven a salir
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/me/2fa");
      const json = await res.json().catch(() => ({}));
      if (!cancelled) setEnabled(res.ok ? json.enabled : false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/me/2fa", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo iniciar la activación");
      return;
    }
    setQrSvg(json.qrSvg);
    setSecret(json.secret);
  }

  async function confirm(method: "PUT" | "DELETE" | "PATCH") {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/me/2fa", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Código no válido");
      return;
    }
    if (method !== "PATCH") setEnabled(method === "PUT");
    setRecoveryCodes(json.recoveryCodes ?? null);
    setCopiedCodes(false);
    setQrSvg(null);
    setSecret(null);
    setCode("");
  }

  async function copyRecoveryCodes() {
    if (!recoveryCodes) return;
    await navigator.clipboard.writeText(recoveryCodes.join("\n")).catch(() => {});
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  }

  if (enabled === null) return null;

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm">
        {enabled ? (
          <>
            <ShieldCheck className="h-4 w-4 text-success-strong" aria-hidden />
            <span className="font-medium text-success-strong">
              Verificación en dos pasos activada
            </span>
          </>
        ) : (
          <>
            <ShieldOff className="h-4 w-4 text-ink-muted" aria-hidden />
            <span className="text-ink-soft">
              Verificación en dos pasos desactivada. Al activarla, iniciar
              sesión pedirá además un código de tu app de autenticación
              (Google Authenticator, 1Password…).
            </span>
          </>
        )}
      </p>

      {!enabled && !qrSvg && (
        <Button variant="secondary" size="sm" disabled={busy} onClick={start}>
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Activar verificación en dos pasos
        </Button>
      )}

      {!enabled && qrSvg && (
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <p className="text-sm text-ink-soft">
            1. Escanea este QR con tu app de autenticación (o añade la clave a
            mano). 2. Escribe el código de 6 dígitos que te muestre.
          </p>
          <div
            className="mt-3 inline-block rounded-lg bg-white p-2 [&_svg]:h-40 [&_svg]:w-40"
            // SVG generado en el servidor a partir del secreto propio
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          {secret && (
            <p className="mt-2 break-all text-xs tabular-nums text-ink-muted">
              Clave manual: {secret}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field label="Código de 6 dígitos" htmlFor="totp-activar">
              <Input
                id="totp-activar"
                inputMode="numeric"
                maxLength={6}
                className="max-w-32 tabular-nums"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
            <Button
              size="sm"
              disabled={busy || code.length < 6}
              onClick={() => confirm("PUT")}
            >
              Confirmar y activar
            </Button>
          </div>
        </div>
      )}

      {recoveryCodes && (
        <div className="rounded-xl border border-warning/40 bg-warning-soft p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-warning-strong">
            <KeyRound className="h-4 w-4" aria-hidden />
            Guarda estos códigos de recuperación AHORA
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Son tu entrada de emergencia si pierdes el móvil. Cada uno funciona
            una sola vez y no volverán a mostrarse. Guárdalos fuera de este
            ordenador (gestor de contraseñas, papel).
          </p>
          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {recoveryCodes.map((c) => (
              <code
                key={c}
                className="rounded bg-surface px-2 py-1 text-center text-xs font-semibold tabular-nums text-ink"
              >
                {c}
              </code>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={copyRecoveryCodes}
          >
            {copiedCodes ? (
              <Check className="h-3.5 w-3.5 text-success-strong" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden />
            )}
            {copiedCodes ? "Copiados" : "Copiar todos"}
          </Button>
        </div>
      )}

      {enabled && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Código actual" htmlFor="totp-off">
            <Input
              id="totp-off"
              inputMode="numeric"
              maxLength={6}
              className="max-w-32 tabular-nums"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || code.length < 6}
            onClick={() => confirm("PATCH")}
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden />
            Regenerar códigos de recuperación
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="text-danger-strong hover:bg-danger-soft"
            disabled={busy || code.length < 6}
            onClick={() => confirm("DELETE")}
          >
            <ShieldOff className="h-3.5 w-3.5" aria-hidden />
            Desactivar
          </Button>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
