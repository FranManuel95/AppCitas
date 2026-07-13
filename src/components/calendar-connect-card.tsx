"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Link2, Unlink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Conexión de Google Calendar (dueño en /admin/ajustes; empleado en
// /personal). Saliente: las citas aparecen como eventos. Entrante: el
// "ocupado" del calendario personal bloquea huecos.
export function CalendarConnectCard({
  kind,
  connection,
}: {
  kind: "admin" | "staff";
  connection: {
    googleEmail: string;
    status: string;
    simulated: boolean;
  } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const base = kind === "admin" ? "/api/admin" : "/api/staff";

  async function disconnect() {
    setBusy(true);
    await fetch(`${base}/calendar/google/disconnect`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        <CalendarDays className="h-4 w-4 text-ink-muted" aria-hidden />
        Google Calendar
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {kind === "admin"
          ? "Conecta el calendario del negocio: cada cita aparece como evento y tu \"ocupado\" personal bloquea huecos de la agenda (si trabajas sin equipo)."
          : "Conecta tu calendario personal: tus citas aparecen como eventos y tu \"ocupado\" bloquea tus huecos."}
      </p>

      {connection ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={connection.status === "active" ? "success" : "danger"}>
              {connection.status === "active" ? "Conectado" : "Reconectar"}
            </Badge>
            <span className="text-ink-soft">{connection.googleEmail}</span>
            {connection.simulated && (
              <Badge tone="neutral">simulado (dev)</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {connection.status !== "active" && (
              <a
                href={`${base}/calendar/google/connect`}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                Reconectar
              </a>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={disconnect}
            >
              <Unlink className="h-3.5 w-3.5" aria-hidden />
              {busy ? "Desconectando…" : "Desconectar"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <a
            href={`${base}/calendar/google/connect`}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            Conectar con Google
          </a>
        </div>
      )}
    </Card>
  );
}
