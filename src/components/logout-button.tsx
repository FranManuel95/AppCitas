"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      className="text-sm text-ink-muted transition-colors hover:text-ink"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
