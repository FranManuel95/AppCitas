"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses } from "@/components/ui/button";

// Baja de la membresía desde "Mis citas": el beneficio dura hasta el fin del
// periodo ya pagado (cancel_at_period_end).
export function MembershipCancelButton({
  membershipId,
  labels,
}: {
  membershipId: string;
  labels: { cancel: string; cancelling: string; error: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/memberships/${membershipId}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? labels.error);
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        className={buttonClasses({ variant: "secondary", size: "sm" })}
        disabled={busy}
        onClick={cancel}
      >
        {busy ? labels.cancelling : labels.cancel}
      </button>
      {error && <span className="text-xs text-danger-strong">{error}</span>}
    </span>
  );
}
