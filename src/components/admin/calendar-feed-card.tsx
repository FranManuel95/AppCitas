"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Copy, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Feed iCal privado: el dueño lo pega en Google Calendar ("Añadir por URL") u
// Outlook y su agenda de AppCitas aparece junto a sus demás calendarios,
// actualizándose sola. Regenerar revoca la URL anterior.
export function CalendarFeedCard({
  feedToken,
  staff,
  baseUrl,
}: {
  feedToken: string | null;
  staff: Array<{ id: string; name: string }>;
  baseUrl: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function mutate(method: "POST" | "DELETE") {
    setBusy(true);
    await fetch("/api/admin/calendar-feed", { method });
    setBusy(false);
    router.refresh();
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  }

  function FeedRow({ label, url }: { label: string; url: string }) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="truncate text-xs tabular-nums text-ink-muted">{url}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={() => copy(url)}
        >
          {copied === url ? (
            <Check className="h-3.5 w-3.5 text-success-strong" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          {copied === url ? "Copiada" : "Copiar"}
        </Button>
      </div>
    );
  }

  return (
    <Card className="print:hidden">
      <h2 className="text-base font-semibold text-ink">
        Conecta tu calendario (Google / Outlook / Apple)
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Suscríbete a tu agenda por URL y tus citas aparecerán junto a tus demás
        calendarios, actualizándose solas. En Google Calendar:{" "}
        <span className="font-medium text-ink-soft">
          Otros calendarios → + → Desde URL
        </span>
        .
      </p>

      {!feedToken ? (
        <Button className="mt-4" disabled={busy} onClick={() => mutate("POST")}>
          <CalendarPlus className="h-4 w-4" aria-hidden />
          Activar el feed de calendario
        </Button>
      ) : (
        <div className="mt-4 space-y-2">
          <FeedRow
            label="Agenda completa del negocio"
            url={`${baseUrl}/api/feeds/${feedToken}`}
          />
          {staff.map((m) => (
            <FeedRow
              key={m.id}
              label={`Solo ${m.name}`}
              url={`${baseUrl}/api/feeds/${feedToken}?staff=${m.id}`}
            />
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => mutate("POST")}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Regenerar URL (revoca la anterior)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger-strong hover:bg-danger-soft"
              disabled={busy}
              onClick={() => mutate("DELETE")}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Desactivar
            </Button>
          </div>
          <p className="text-xs text-ink-muted">
            Cualquiera con la URL puede ver la agenda: trátala como una
            contraseña. Google tarda unas horas en refrescar; Outlook y Apple
            suelen hacerlo cada 15-30 min.
          </p>
        </div>
      )}
    </Card>
  );
}
