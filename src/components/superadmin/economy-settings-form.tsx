"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { PlatformSettings } from "@/lib/domain/platform-settings";

// Costes editables de la plataforma. Se introducen en € (y % para Stripe) y
// se persisten en céntimos/basis points; al guardar, la página recalcula el
// beneficio con router.refresh().
export function EconomySettingsForm({
  settings,
}: {
  settings: PlatformSettings;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const eur = (k: string) => Math.round(Number(form.get(k)) * 100);
    const bps = Math.round(Number(form.get("stripeFeePercent")) * 100);

    const res = await fetch("/api/superadmin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fixedMonthlyCostCents: eur("fixedMonthlyCost"),
        whatsappMsgCostCents: eur("whatsappMsgCost"),
        smsMsgCostCents: eur("smsMsgCost"),
        stripeFeeBps: bps,
        stripeFeeFixedCents: eur("stripeFeeFixed"),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMessage({
        kind: "error",
        text: json.error ?? "No se pudieron guardar los costes",
      });
      setBusy(false);
      return;
    }
    setMessage({ kind: "ok", text: "Costes guardados: beneficio recalculado." });
    setBusy(false);
    router.refresh();
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold tracking-tight text-ink">
        Tus costes
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Edítalos y el beneficio se recalcula al momento. Los ingresos salen
        solos de las suscripciones activas.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field
          label="Costes fijos al mes (€)"
          htmlFor="eco-fixed"
          hint="Hosting, base de datos, dominio…"
        >
          <Input
            id="eco-fixed"
            name="fixedMonthlyCost"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={(settings.fixedMonthlyCostCents / 100).toFixed(2)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Coste por WhatsApp (€)" htmlFor="eco-wa">
            <Input
              id="eco-wa"
              name="whatsappMsgCost"
              type="number"
              min={0}
              step="0.001"
              required
              defaultValue={(settings.whatsappMsgCostCents / 100).toFixed(3)}
            />
          </Field>
          <Field label="Coste por SMS (€)" htmlFor="eco-sms">
            <Input
              id="eco-sms"
              name="smsMsgCost"
              type="number"
              min={0}
              step="0.001"
              required
              defaultValue={(settings.smsMsgCostCents / 100).toFixed(3)}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Comisión de Stripe (%)" htmlFor="eco-stripe-pct">
            <Input
              id="eco-stripe-pct"
              name="stripeFeePercent"
              type="number"
              min={0}
              max={20}
              step="0.01"
              required
              defaultValue={(settings.stripeFeeBps / 100).toFixed(2)}
            />
          </Field>
          <Field label="Fijo de Stripe por cobro (€)" htmlFor="eco-stripe-fix">
            <Input
              id="eco-stripe-fix"
              name="stripeFeeFixed"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={(settings.stripeFeeFixedCents / 100).toFixed(2)}
            />
          </Field>
        </div>

        {message && (
          <p
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
              message.kind === "ok"
                ? "bg-success-soft text-success-strong"
                : "bg-danger-soft text-danger-strong"
            }`}
            role={message.kind === "error" ? "alert" : undefined}
          >
            {message.kind === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            {message.text}
          </p>
        )}

        <Button type="submit" disabled={busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          Guardar costes
        </Button>
      </form>
    </Card>
  );
}
