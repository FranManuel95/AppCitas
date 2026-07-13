"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, MessageSquareText, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Editor de los textos de los mensajes al cliente. Cada plantilla puede
// personalizarse con variables {…}; vacío = texto por defecto de la app.

type TemplateKey = "BOOKING_CONFIRMED" | "REMINDER" | "CANCELLED" | "NO_SHOW";

const TEMPLATE_META: Array<{
  key: TemplateKey;
  label: string;
  hint?: string;
}> = [
  { key: "BOOKING_CONFIRMED", label: "Confirmación de reserva" },
  {
    key: "REMINDER",
    label: "Recordatorio",
    hint: "Si tu texto no incluye {enlace}, el enlace de confirmación se añade solo al final (no puede perderse).",
  },
  {
    key: "CANCELLED",
    label: "Cancelación",
    hint: "La línea del cargo (si lo hubo) se añade siempre al final.",
  },
  {
    key: "NO_SHOW",
    label: "No presentado",
    hint: "La línea del cargo (si lo hubo) se añade siempre al final.",
  },
];

const VARIABLES = [
  "cliente",
  "negocio",
  "servicio",
  "fecha",
  "hora",
  "precio",
  "enlace",
] as const;

interface Override {
  subject?: string;
  body?: string;
}

export function NotificationTemplatesEditor({
  initial,
  defaults,
  sampleValues,
}: {
  initial: Partial<Record<TemplateKey, Override>>;
  // Mensaje por defecto ya renderizado con datos de ejemplo (para la vista previa)
  defaults: Record<TemplateKey, { subject: string; body: string }>;
  // Valores de ejemplo por variable, para previsualizar el texto propio
  sampleValues: Record<string, string>;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<TemplateKey, Override>>(() => {
    const base = {} as Record<TemplateKey, Override>;
    for (const { key } of TEMPLATE_META) {
      base[key] = {
        subject: initial[key]?.subject ?? "",
        body: initial[key]?.body ?? "",
      };
    }
    return base;
  });
  const [preview, setPreview] = useState<TemplateKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function setField(key: TemplateKey, field: "subject" | "body", value: string) {
    setSaved(false);
    setDrafts((d) => ({ ...d, [key]: { ...d[key], [field]: value } }));
  }

  function appendVariable(key: TemplateKey, variable: string) {
    setSaved(false);
    setDrafts((d) => {
      const body = d[key].body ?? "";
      const sep = body && !body.endsWith(" ") && !body.endsWith("\n") ? " " : "";
      return { ...d, [key]: { ...d[key], body: `${body}${sep}{${variable}}` } };
    });
  }

  function renderSample(text: string): string {
    return text.replace(/\{([a-z]+)\}/g, (token, name: string) =>
      name in sampleValues ? sampleValues[name] : token,
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    const payload: Record<string, Override> = {};
    for (const { key } of TEMPLATE_META) {
      const subject = drafts[key].subject?.trim();
      const body = drafts[key].body?.trim();
      if (subject || body) {
        payload[key] = {
          ...(subject ? { subject } : {}),
          ...(body ? { body } : {}),
        };
      }
    }
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationTemplates: payload }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "No se pudieron guardar los textos");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        <MessageSquareText className="h-4 w-4 text-ink-muted" aria-hidden />
        Textos de tus mensajes
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Personaliza lo que reciben tus clientes por email, SMS y WhatsApp. Deja
        un campo vacío para usar el texto por defecto. Variables disponibles:{" "}
        {VARIABLES.map((v) => `{${v}}`).join(" ")}.
      </p>

      <div className="mt-4 space-y-5">
        {TEMPLATE_META.map(({ key, label, hint }) => {
          const draft = drafts[key];
          const hasCustom = Boolean(draft.subject?.trim() || draft.body?.trim());
          const showPreview = preview === key;
          return (
            <div key={key} className="rounded-xl border border-border p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">{label}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-xs font-medium text-brand-700 hover:underline"
                    onClick={() => setPreview(showPreview ? null : key)}
                  >
                    {showPreview ? "Ocultar vista previa" : "Vista previa"}
                  </button>
                  {hasCustom && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"
                      onClick={() => {
                        setSaved(false);
                        setDrafts((d) => ({
                          ...d,
                          [key]: { subject: "", body: "" },
                        }));
                      }}
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden />
                      Restaurar por defecto
                    </button>
                  )}
                </div>
              </div>

              <input
                type="text"
                value={draft.subject ?? ""}
                onChange={(e) => setField(key, "subject", e.target.value)}
                placeholder={`Asunto por defecto: ${defaults[key].subject}`}
                maxLength={120}
                className="input mt-2 w-full text-sm"
              />
              <textarea
                value={draft.body ?? ""}
                onChange={(e) => setField(key, "body", e.target.value)}
                placeholder="Cuerpo del mensaje (vacío = texto por defecto)"
                rows={3}
                maxLength={1000}
                className="input mt-2 w-full text-sm"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => appendVariable(key, v)}
                    className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-ink-soft transition-colors hover:border-brand-300 hover:text-ink"
                  >
                    {`{${v}}`}
                  </button>
                ))}
              </div>
              {hint && <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>}

              {showPreview && (
                <div className="mt-2.5 rounded-lg bg-surface-3/60 px-3 py-2.5 text-sm">
                  <p className="font-medium text-ink">
                    {draft.subject?.trim()
                      ? renderSample(draft.subject)
                      : defaults[key].subject}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-ink-soft">
                    {draft.body?.trim()
                      ? renderSample(draft.body)
                      : defaults[key].body}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} disabled={busy}>
          {busy ? "Guardando…" : "Guardar textos"}
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-success-strong">
            <Check className="h-4 w-4" aria-hidden />
            Guardado
          </span>
        )}
      </div>
    </Card>
  );
}
