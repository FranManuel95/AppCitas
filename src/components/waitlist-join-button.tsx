"use client";

import { useState } from "react";
import { BellPlus, Check } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

// Botón para apuntarse a la lista de espera de un servicio en un día concreto,
// desde el estado "sin huecos" del asistente de reserva. Se muestra solo a
// usuarios con sesión.
export function WaitlistJoinButton({
  businessId,
  serviceId,
  dateISO,
  staffId,
}: {
  businessId: string;
  serviceId: string;
  dateISO: string;
  staffId?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function join() {
    setState("loading");
    setMessage("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId,
          serviceId,
          desiredDate: dateISO,
          staffId: staffId || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMessage(json?.error ?? "No se pudo apuntar a la lista de espera.");
        return;
      }
      setState("done");
    } catch {
      setState("error");
      setMessage("Error de red. Inténtalo de nuevo.");
    }
  }

  if (state === "done") {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2.5 text-sm text-success-strong">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        Te avisaremos si se libera un hueco ese día.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={join}
        disabled={state === "loading"}
        className={buttonClasses({ variant: "secondary", size: "sm" })}
      >
        <BellPlus className="h-4 w-4" aria-hidden />
        {state === "loading" ? "Apuntando…" : "Avísame si se libera un hueco"}
      </button>
      {state === "error" && (
        <p className="text-sm text-danger-strong">{message}</p>
      )}
    </div>
  );
}
