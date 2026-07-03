"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AlertCircle, Clock, Plus, Tags } from "lucide-react";
import { formatCents } from "@/lib/money";
import type { Dict } from "@/lib/i18n/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";

interface ServiceDTO {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  color: string;
  active: boolean;
}

export interface ServicesManagerLabels {
  servicios: Pick<
    Dict["admin"]["servicios"],
    | "newService"
    | "nameLabel"
    | "descriptionLabel"
    | "durationLabel"
    | "priceLabel"
    | "colorLabel"
    | "saveError"
    | "submitCreate"
    | "emptyTitle"
    | "emptyDescription"
  >;
  common: Pick<
    Dict["admin"]["common"],
    | "edit"
    | "cancel"
    | "activate"
    | "deactivate"
    | "saving"
    | "saveChanges"
    | "inactive"
    | "min"
  >;
}

function ServiceForm({
  initial,
  labels,
  onDone,
  onCancel,
}: {
  initial?: ServiceDTO;
  labels: ServicesManagerLabels;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const body = {
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? "") || undefined,
      durationMinutes: Number(form.get("durationMinutes")),
      priceCents: Math.round(Number(form.get("price")) * 100),
      color: String(form.get("color") ?? "#6366f1"),
    };

    const res = await fetch(
      initial ? `/api/admin/services/${initial.id}` : "/api/admin/services",
      {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? labels.servicios.saveError);
      setBusy(false);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label={labels.servicios.nameLabel} className="sm:col-span-2">
        <Input name="name" required minLength={2} defaultValue={initial?.name} />
      </Field>
      <Field label={labels.servicios.descriptionLabel} className="sm:col-span-2">
        <Input name="description" defaultValue={initial?.description ?? ""} />
      </Field>
      <Field label={labels.servicios.durationLabel}>
        <Input
          name="durationMinutes"
          type="number"
          min={5}
          max={600}
          step={5}
          required
          defaultValue={initial?.durationMinutes ?? 30}
          className="tabular-nums"
        />
      </Field>
      <Field label={labels.servicios.priceLabel}>
        <Input
          name="price"
          type="number"
          min={0}
          step="0.01"
          required
          defaultValue={initial ? initial.priceCents / 100 : ""}
          className="tabular-nums"
        />
      </Field>
      <Field label={labels.servicios.colorLabel}>
        <input
          name="color"
          type="color"
          defaultValue={initial?.color ?? "#6366f1"}
          className="h-10 w-16 cursor-pointer rounded-lg border border-border-strong bg-surface p-1 shadow-xs"
        />
      </Field>
      {error && (
        <p className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong sm:col-span-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy
            ? labels.common.saving
            : initial
              ? labels.common.saveChanges
              : labels.servicios.submitCreate}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {labels.common.cancel}
          </Button>
        )}
      </div>
    </form>
  );
}

export function ServicesManager({
  services,
  currency,
  labels,
}: {
  services: ServiceDTO[];
  currency: string;
  labels: ServicesManagerLabels;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function refresh() {
    setEditing(null);
    setCreating(false);
    router.refresh();
  }

  async function toggleActive(service: ServiceDTO) {
    await fetch(`/api/admin/services/${service.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !service.active }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!creating && (
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          {labels.servicios.newService}
        </Button>
      )}
      {creating && (
        <Card>
          <h2 className="mb-4 font-semibold text-ink">
            {labels.servicios.newService}
          </h2>
          <ServiceForm
            labels={labels}
            onDone={refresh}
            onCancel={() => setCreating(false)}
          />
        </Card>
      )}

      <div className="space-y-3">
        {services.map((s) => (
          <Card key={s.id}>
            {editing === s.id ? (
              <ServiceForm
                initial={s}
                labels={labels}
                onDone={refresh}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-border/60"
                    style={{ background: s.color }}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{s.name}</p>
                      {!s.active && (
                        <Badge tone="neutral">{labels.common.inactive}</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-muted">
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="tabular-nums">
                        {s.durationMinutes} {labels.common.min}
                      </span>
                      {s.description ? <span>· {s.description}</span> : null}
                    </p>
                  </div>
                </div>
                <p className="text-right text-sm font-semibold tabular-nums text-ink">
                  {formatCents(s.priceCents, currency)}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditing(s.id)}
                  >
                    {labels.common.edit}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleActive(s)}
                  >
                    {s.active ? labels.common.deactivate : labels.common.activate}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
        {services.length === 0 && (
          <EmptyState
            icon={Tags}
            title={labels.servicios.emptyTitle}
            description={labels.servicios.emptyDescription}
          />
        )}
      </div>
    </div>
  );
}
