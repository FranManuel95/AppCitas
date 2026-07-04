"use client";

import { useState } from "react";
import { BellPlus, Check } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

// Botón para apuntarse a la lista de espera de un servicio en un día concreto,
// desde el estado "sin huecos" del asistente de reserva. Se muestra solo a
// usuarios con sesión.
export interface WaitlistJoinLabels {
  join: string;
  joining: string;
  done: string;
  error: string;
}

export function WaitlistJoinButton({
  businessId,
  serviceId,
  dateISO,
  staffId,
  labels,
}: {
  businessId: string;
  serviceId: string;
  dateISO: string;
  staffId?: string;
  labels: WaitlistJoinLabels;
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
        setMessage(json?.error ?? labels.error);
        return;
      }
      setState("done");
    } catch {
      setState("error");
      setMessage(labels.error);
    }
  }

  if (state === "done") {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2.5 text-sm text-success-strong">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        {labels.done}
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
        {state === "loading" ? labels.joining : labels.join}
      </button>
      {state === "error" && (
        <p className="text-sm text-danger-strong">{message}</p>
      )}
    </div>
  );
}
