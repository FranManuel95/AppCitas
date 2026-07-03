"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Plus, Trash2, X } from "lucide-react";
import { WEEKDAY_ORDER, weekdayNames } from "@/lib/weekdays";
import type { Dict, Locale } from "@/lib/i18n/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { SectionHeader } from "@/components/ui/section-header";

interface HourRange {
  weekday: number;
  openTime: string;
  closeTime: string;
}

interface ClosureDTO {
  id: string;
  date: string;
  reason: string | null;
}

export interface HoursEditorLabels {
  horario: Pick<
    Dict["admin"]["horario"],
    | "weeklyTitle"
    | "weeklyDescription"
    | "saved"
    | "addError"
    | "remove"
    | "closed"
    | "addRange"
    | "save"
    | "closuresTitle"
    | "closuresDescription"
    | "closureDate"
    | "closureReason"
    | "closureReasonPlaceholder"
    | "addClosure"
    | "delete"
    | "noClosures"
  >;
  common: Pick<Dict["admin"]["common"], "saving" | "saveError">;
}

export function HoursEditor({
  initialHours,
  closures,
  locale,
  labels,
}: {
  initialHours: HourRange[];
  closures: ClosureDTO[];
  locale: Locale;
  labels: HoursEditorLabels;
}) {
  const router = useRouter();
  const weekdays = weekdayNames(locale);
  const [hours, setHours] = useState<HourRange[]>(initialHours);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  function addRange(weekday: number) {
    setHours((h) => [
      ...h,
      { weekday, openTime: "09:00", closeTime: "18:00" },
    ]);
  }

  function updateRange(index: number, patch: Partial<HourRange>) {
    setHours((h) => h.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRange(index: number) {
    setHours((h) => h.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ kind: "error", text: json.error ?? labels.common.saveError });
    } else {
      setMessage({ kind: "ok", text: labels.horario.saved });
      router.refresh();
    }
    setSaving(false);
  }

  async function addClosure(formData: FormData) {
    const date = String(formData.get("date") ?? "");
    const reason = String(formData.get("reason") ?? "");
    const res = await fetch("/api/admin/closures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, reason: reason || undefined }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ kind: "error", text: json.error ?? labels.horario.addError });
      return;
    }
    setMessage(null);
    router.refresh();
  }

  async function removeClosure(id: string) {
    await fetch("/api/admin/closures", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeader
          title={labels.horario.weeklyTitle}
          description={labels.horario.weeklyDescription}
        />
        <div className="mt-5 space-y-4">
          {WEEKDAY_ORDER.map((weekday) => {
            const dayRanges = hours
              .map((r, index) => ({ ...r, index }))
              .filter((r) => r.weekday === weekday);
            return (
              <div
                key={weekday}
                className="flex flex-wrap items-start gap-3 border-b border-border pb-4 last:border-0 last:pb-0"
              >
                <span className="w-24 pt-1.5 text-sm font-medium text-ink">
                  {weekdays[weekday]}
                </span>
                <div className="flex flex-1 flex-col gap-2">
                  {dayRanges.map((r) => (
                    <div key={r.index} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={r.openTime}
                        onChange={(e) =>
                          updateRange(r.index, { openTime: e.target.value })
                        }
                        className="max-w-32 py-1.5 tabular-nums"
                      />
                      <span className="text-ink-muted" aria-hidden>
                        –
                      </span>
                      <Input
                        type="time"
                        value={r.closeTime}
                        onChange={(e) =>
                          updateRange(r.index, { closeTime: e.target.value })
                        }
                        className="max-w-32 py-1.5 tabular-nums"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={labels.horario.remove}
                        title={labels.horario.remove}
                        onClick={() => removeRange(r.index)}
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  ))}
                  {dayRanges.length === 0 && (
                    <p className="pt-1.5 text-sm text-ink-muted">
                      {labels.horario.closed}
                    </p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => addRange(weekday)}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  {labels.horario.addRange}
                </Button>
              </div>
            );
          })}
        </div>
        {message && (
          <p
            className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
              message.kind === "ok"
                ? "bg-success-soft text-success-strong"
                : "bg-danger-soft text-danger-strong"
            }`}
          >
            {message.kind === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            {message.text}
          </p>
        )}
        <Button className="mt-4" disabled={saving} onClick={save}>
          {saving ? labels.common.saving : labels.horario.save}
        </Button>
      </Card>

      <Card>
        <SectionHeader
          title={labels.horario.closuresTitle}
          description={labels.horario.closuresDescription}
        />
        <form
          action={addClosure}
          className="mt-5 flex flex-wrap items-end gap-2"
        >
          <Field label={labels.horario.closureDate} htmlFor="closure-date">
            <Input
              id="closure-date"
              type="date"
              name="date"
              required
              className="tabular-nums"
            />
          </Field>
          <Field
            label={labels.horario.closureReason}
            htmlFor="closure-reason"
            className="min-w-40 flex-1"
          >
            <Input
              id="closure-reason"
              name="reason"
              placeholder={labels.horario.closureReasonPlaceholder}
            />
          </Field>
          <Button type="submit" variant="secondary">
            {labels.horario.addClosure}
          </Button>
        </form>
        <ul className="mt-4 space-y-2">
          {closures.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <span className="min-w-0 text-ink-soft">
                <span className="font-medium tabular-nums text-ink">
                  {c.date}
                </span>
                {c.reason && (
                  <span className="text-ink-muted"> · {c.reason}</span>
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-danger-strong hover:bg-danger-soft hover:text-danger-strong"
                onClick={() => removeClosure(c.id)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {labels.horario.delete}
              </Button>
            </li>
          ))}
          {closures.length === 0 && (
            <li className="text-sm text-ink-muted">
              {labels.horario.noClosures}
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}
