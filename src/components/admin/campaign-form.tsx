"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

interface SegmentOption {
  id: string;
  label: string;
  count: number;
}

// Redacta y envía una campaña. El servidor resuelve el segmento y encola los
// envíos en el outbox; aquí solo se elige a quién, por dónde y el texto.
export function CampaignForm({
  segments,
  disabled,
}: {
  segments: SegmentOption[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [segment, setSegment] = useState(segments[0]?.id ?? "ALL");
  const [channel, setChannel] = useState("EMAIL");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  const selected = segments.find((s) => s.id === segment);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        segment,
        channel,
        subject: channel === "EMAIL" ? subject.trim() : undefined,
        body: body.trim(),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      campaign?: { recipientCount: number };
      error?: string;
    };
    if (!res.ok || !json.campaign) {
      setMessage({
        kind: "error",
        text: json.error ?? "No se pudo enviar la campaña",
      });
      setBusy(false);
      return;
    }
    setMessage({
      kind: "ok",
      text: `Campaña encolada para ${json.campaign.recipientCount} destinatario(s). Se envía por el mismo sistema fiable que los recordatorios.`,
    });
    setSubject("");
    setBody("");
    setBusy(false);
    router.refresh();
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold tracking-tight text-ink">
        Nueva campaña
      </h2>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field label="Segmento" htmlFor="campaign-segment">
          <Select
            id="campaign-segment"
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            disabled={disabled}
          >
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} · {s.count} cliente{s.count === 1 ? "" : "s"}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Canal" htmlFor="campaign-channel">
          <Select
            id="campaign-channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            disabled={disabled}
          >
            <option value="EMAIL">Email (con la marca de tu negocio)</option>
            <option value="WHATSAPP">WhatsApp (clientes con teléfono)</option>
            <option value="SMS">SMS (clientes con teléfono)</option>
          </Select>
        </Field>

        {channel === "EMAIL" && (
          <Field label="Asunto" htmlFor="campaign-subject">
            <Input
              id="campaign-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={150}
              required
              disabled={disabled}
              placeholder="Ej.: 20% en tu próxima visita esta semana"
            />
          </Field>
        )}

        <Field label="Mensaje" htmlFor="campaign-body">
          <Textarea
            id="campaign-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={2000}
            required
            disabled={disabled}
            placeholder="Escribe tu oferta o novedad…"
            className="resize-none"
          />
        </Field>

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

        <Button
          type="submit"
          disabled={disabled || busy || !body.trim() || !selected?.count}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          Enviar a {selected?.count ?? 0} cliente
          {(selected?.count ?? 0) === 1 ? "" : "s"}
        </Button>
      </form>
    </Card>
  );
}
