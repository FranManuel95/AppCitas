"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Dict } from "@/lib/i18n/shared";

type Labels = Dict["unsubscribe"];

export function UnsubscribeButton({
  token,
  labels,
}: {
  token: string;
  labels: Labels;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(
    "idle",
  );

  async function confirm() {
    setState("busy");
    const res = await fetch("/api/marketing/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setState(res.ok ? "done" : "error");
  }

  if (state === "done") {
    return (
      <p className="mt-5 flex items-center justify-center gap-1.5 text-sm font-medium text-ink">
        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
        {labels.done}
      </p>
    );
  }

  return (
    <div className="mt-5 space-y-2">
      <Button
        className="w-full sm:w-auto"
        disabled={state === "busy"}
        onClick={confirm}
      >
        {state === "busy" ? labels.working : labels.confirm}
      </Button>
      {state === "error" && (
        <p className="flex items-center justify-center gap-1.5 text-sm text-danger-strong">
          <AlertCircle className="h-4 w-4" aria-hidden />
          {labels.error}
        </p>
      )}
    </div>
  );
}
