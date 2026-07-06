"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { Dict } from "@/lib/i18n/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SectionHeader } from "@/components/ui/section-header";
import { Switch } from "@/components/ui/switch";

interface BusinessSettings {
  name: string;
  description: string | null;
  category: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  cancellationWindowHours: number;
  lateCancellationFeePercent: number;
  slotGranularityMinutes: number;
  maxAdvanceBookingDays: number;
  minNoticeMinutes: number;
  requireCardToBook: boolean;
  depositPercent: number;
  remindersEnabled: boolean;
  reminderHoursBefore: number;
  reminder2HoursBefore: number | null;
  autoCompleteEnabled: boolean;
  notifyByEmail: boolean;
  notifyBySms: boolean;
  notifyByWhatsapp: boolean;
  taxId: string | null;
  taxPercent: number;
}

// Textos resueltos en el servidor: el subárbol admin.ajustes completo más los
// estados comunes de guardado.
type SettingsLabels = Dict["admin"]["ajustes"] &
  Pick<Dict["admin"]["common"], "saving" | "saveError">;

export function SettingsForm({
  business,
  labels,
}: {
  business: BusinessSettings;
  labels: SettingsLabels;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const str = (k: string) => String(form.get(k) ?? "").trim();
    const num = (k: string) => Number(form.get(k));

    const bool = (k: string) => form.get(k) === "on";

    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: str("name"),
        description: str("description") || null,
        category: str("category") || "general",
        address: str("address") || null,
        phone: str("phone") || null,
        email: str("email") || null,
        cancellationWindowHours: num("cancellationWindowHours"),
        lateCancellationFeePercent: num("lateCancellationFeePercent"),
        slotGranularityMinutes: num("slotGranularityMinutes"),
        maxAdvanceBookingDays: num("maxAdvanceBookingDays"),
        minNoticeMinutes: num("minNoticeMinutes"),
        requireCardToBook: bool("requireCardToBook"),
        depositPercent: num("depositPercent"),
        remindersEnabled: bool("remindersEnabled"),
        reminderHoursBefore: num("reminderHoursBefore"),
        // Vacío = segundo recordatorio desactivado
        reminder2HoursBefore: str("reminder2HoursBefore")
          ? num("reminder2HoursBefore")
          : null,
        autoCompleteEnabled: bool("autoCompleteEnabled"),
        notifyByEmail: bool("notifyByEmail"),
        notifyBySms: bool("notifyBySms"),
        notifyByWhatsapp: bool("notifyByWhatsapp"),
        taxId: str("taxId") || null,
        taxPercent: num("taxPercent"),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ kind: "error", text: json.error ?? labels.saveError });
    } else {
      setMessage({ kind: "ok", text: labels.saved });
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <SectionHeader as="h2" title={labels.businessDataTitle} />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label={labels.nameLabel} htmlFor="settings-name">
            <Input
              id="settings-name"
              name="name"
              required
              minLength={2}
              defaultValue={business.name}
            />
          </Field>
          <Field label={labels.categoryLabel} htmlFor="settings-category">
            <Input
              id="settings-category"
              name="category"
              defaultValue={business.category}
              placeholder={labels.categoryPlaceholder}
            />
          </Field>
          <Field
            label={labels.descriptionLabel}
            htmlFor="settings-description"
            className="sm:col-span-2"
          >
            <Textarea
              id="settings-description"
              name="description"
              rows={2}
              defaultValue={business.description ?? ""}
            />
          </Field>
          <Field label={labels.addressLabel} htmlFor="settings-address">
            <Input
              id="settings-address"
              name="address"
              defaultValue={business.address ?? ""}
            />
          </Field>
          <Field label={labels.phoneLabel} htmlFor="settings-phone">
            <Input
              id="settings-phone"
              name="phone"
              defaultValue={business.phone ?? ""}
            />
          </Field>
          <Field label={labels.contactEmailLabel} htmlFor="settings-email">
            <Input
              id="settings-email"
              name="email"
              type="email"
              defaultValue={business.email ?? ""}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionHeader
          as="h2"
          title={labels.policyTitle}
          description={labels.policyDescription}
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field
            label={labels.cancellationWindowLabel}
            htmlFor="settings-cancellation-window"
            hint={labels.cancellationWindowHint}
          >
            <Input
              id="settings-cancellation-window"
              name="cancellationWindowHours"
              type="number"
              min={0}
              max={720}
              required
              defaultValue={business.cancellationWindowHours}
            />
          </Field>
          <Field
            label={labels.lateFeeLabel}
            htmlFor="settings-late-fee"
            hint={labels.lateFeeHint}
          >
            <Input
              id="settings-late-fee"
              name="lateCancellationFeePercent"
              type="number"
              min={0}
              max={100}
              required
              defaultValue={business.lateCancellationFeePercent}
            />
          </Field>
          <Field
            label={labels.slotGranularityLabel}
            htmlFor="settings-slot-granularity"
          >
            <Input
              id="settings-slot-granularity"
              name="slotGranularityMinutes"
              type="number"
              min={5}
              max={120}
              step={5}
              required
              defaultValue={business.slotGranularityMinutes}
            />
          </Field>
          <Field
            label={labels.minNoticeLabel}
            htmlFor="settings-min-notice"
          >
            <Input
              id="settings-min-notice"
              name="minNoticeMinutes"
              type="number"
              min={0}
              max={10080}
              required
              defaultValue={business.minNoticeMinutes}
            />
          </Field>
          <Field
            label={labels.maxAdvanceLabel}
            htmlFor="settings-max-advance"
          >
            <Input
              id="settings-max-advance"
              name="maxAdvanceBookingDays"
              type="number"
              min={1}
              max={365}
              required
              defaultValue={business.maxAdvanceBookingDays}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionHeader
          as="h2"
          title={labels.remindersTitle}
          description={labels.remindersDescription}
        />
        <div className="mt-5 space-y-4">
          <Switch
            name="remindersEnabled"
            defaultChecked={business.remindersEnabled}
            label={labels.remindersEnabledLabel}
          />
          <Field
            label={labels.reminderHoursLabel}
            htmlFor="settings-reminder-hours"
            hint={labels.reminderHoursHint}
            className="max-w-xs"
          >
            <Input
              id="settings-reminder-hours"
              name="reminderHoursBefore"
              type="number"
              min={1}
              max={336}
              required
              defaultValue={business.reminderHoursBefore}
            />
          </Field>
          <Field
            label={labels.reminder2Label}
            htmlFor="settings-reminder2-hours"
            className="max-w-xs"
          >
            <Input
              id="settings-reminder2-hours"
              name="reminder2HoursBefore"
              type="number"
              min={1}
              max={168}
              defaultValue={business.reminder2HoursBefore ?? ""}
            />
          </Field>
          <div className="border-t border-border pt-4">
            <Switch
              name="autoCompleteEnabled"
              defaultChecked={business.autoCompleteEnabled}
              label={labels.autoCompleteLabel}
            />
            <p className="mt-1.5 text-xs text-ink-muted">
              {labels.autoCompleteHint}
            </p>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-ink-soft">
              {labels.channelsTitle}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
              <Switch
                name="notifyByEmail"
                defaultChecked={business.notifyByEmail}
                label={labels.channelEmail}
              />
              <Switch
                name="notifyBySms"
                defaultChecked={business.notifyBySms}
                label={labels.channelSms}
              />
              <Switch
                name="notifyByWhatsapp"
                defaultChecked={business.notifyByWhatsapp}
                label={labels.channelWhatsapp}
              />
            </div>
          </div>
          <p className="text-xs text-ink-muted">{labels.channelsNote}</p>
        </div>
      </Card>

      <Card>
        <SectionHeader as="h2" title={labels.billingTitle} />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label={labels.taxIdLabel} htmlFor="settings-tax-id">
            <Input
              id="settings-tax-id"
              name="taxId"
              defaultValue={business.taxId ?? ""}
            />
          </Field>
          <Field label={labels.taxPercentLabel} htmlFor="settings-tax-percent">
            <Input
              id="settings-tax-percent"
              name="taxPercent"
              type="number"
              min={0}
              max={50}
              required
              defaultValue={business.taxPercent}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionHeader as="h2" title={labels.paymentsTitle} />
        <div className="mt-5 space-y-3">
          <Switch
            name="requireCardToBook"
            defaultChecked={business.requireCardToBook}
            label={labels.requireCardLabel}
          />
          <p className="text-xs text-ink-muted">{labels.requireCardHint}</p>
          <Field label={labels.depositLabel} htmlFor="settings-deposit-percent">
            <Input
              id="settings-deposit-percent"
              name="depositPercent"
              type="number"
              min={0}
              max={100}
              required
              defaultValue={business.depositPercent}
              className="max-w-32"
            />
          </Field>
          <p className="text-xs text-ink-muted">{labels.depositHint}</p>
        </div>
      </Card>

      {message && (
        <p
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
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
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? labels.saving : labels.save}
      </Button>
    </form>
  );
}
