"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, BadgeCheck, Plus } from "lucide-react";
import { formatCents } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface PlanDTO {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  discountPercent: number;
  maxAppointmentsPerMonth: number | null;
  active: boolean;
  members: number;
}

// Planes de membresía del negocio (cuota mensual → % de descuento en citas).
// Las condiciones de un plan no se editan (los socios pagan lo contratado):
// para cambiarlas se crea un plan nuevo y se desactiva el antiguo.
export function MembershipPlansCard({
  plans,
  currency,
}: {
  plans: PlanDTO[];
  currency: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(form: FormData) {
    setBusy(true);
    setError(null);
    const priceEuros = Number(
      String(form.get("price") ?? "").replace(",", "."),
    );
    const cap = Number(form.get("cap"));
    const res = await fetch("/api/admin/membership-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? "").trim() || null,
        priceCents: Math.round(priceEuros * 100),
        discountPercent: Number(form.get("discount")),
        maxAppointmentsPerMonth: cap > 0 ? cap : null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "No se pudo crear el plan");
      return;
    }
    setCreating(false);
    router.refresh();
  }

  async function toggle(plan: PlanDTO) {
    setBusy(true);
    await fetch(`/api/admin/membership-plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !plan.active }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <BadgeCheck className="h-4 w-4 text-ink-muted" aria-hidden />
          Membresías
        </h2>
        {!creating && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Nuevo plan
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Ingresos recurrentes: tus clientes pagan una cuota mensual y sus citas
        salen con descuento automático. Se cobra online con la tarjeta guardada
        (en local, simulado). Un plan del 100% exige tope mensual de citas.
      </p>

      {creating && (
        <form
          className="mt-4 grid gap-3 rounded-xl border border-border p-3.5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create(new FormData(e.currentTarget));
          }}
        >
          <label className="text-sm text-ink-soft">
            Nombre
            <input name="name" required minLength={2} maxLength={80} className="input mt-1 w-full text-sm" placeholder="Socio VIP" />
          </label>
          <label className="text-sm text-ink-soft">
            Cuota mensual (€)
            <input name="price" required type="text" inputMode="decimal" className="input mt-1 w-full text-sm" placeholder="19,90" />
          </label>
          <label className="text-sm text-ink-soft">
            Descuento en citas (%)
            <input name="discount" required type="number" min={1} max={100} className="input mt-1 w-full text-sm" defaultValue={15} />
          </label>
          <label className="text-sm text-ink-soft">
            Tope de citas al mes (0 = sin tope)
            <input name="cap" type="number" min={0} max={100} className="input mt-1 w-full text-sm" defaultValue={0} />
          </label>
          <label className="text-sm text-ink-soft sm:col-span-2">
            Descripción (opcional)
            <input name="description" maxLength={300} className="input mt-1 w-full text-sm" placeholder="Para clientes habituales" />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Creando…" : "Crear plan"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setCreating(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {plans.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 p-3.5"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-ink">{p.name}</p>
                <Badge tone="brand">
                  {formatCents(p.priceCents, currency)}/mes
                </Badge>
                {!p.active && <Badge tone="neutral">Inactivo</Badge>}
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                {p.discountPercent}% de descuento
                {p.maxAppointmentsPerMonth
                  ? ` · máx. ${p.maxAppointmentsPerMonth} citas/mes`
                  : ""}{" "}
                · {p.members} socio{p.members === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => toggle(p)}
            >
              {p.active ? "Desactivar" : "Activar"}
            </Button>
          </div>
        ))}
        {plans.length === 0 && !creating && (
          <p className="text-sm text-ink-muted">
            Aún no hay planes. Crea el primero: por ejemplo, 19,90 €/mes con un
            15% de descuento.
          </p>
        )}
      </div>
    </Card>
  );
}
