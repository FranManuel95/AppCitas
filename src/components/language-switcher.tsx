"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/lib/i18n/shared";
import { cn } from "@/lib/cn";

export function LanguageSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setLocale(locale: Locale) {
    if (locale === current || busy) return;
    setBusy(true);
    await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    });
    router.refresh();
    setBusy(false);
  }

  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-surface-3 p-0.5 text-xs">
      {(["es", "en"] as const).map((locale) => (
        <button
          key={locale}
          onClick={() => setLocale(locale)}
          disabled={busy}
          className={cn(
            "rounded-full px-2 py-0.5 font-medium transition-colors disabled:cursor-not-allowed",
            locale === current
              ? "bg-surface text-ink shadow-xs"
              : "text-ink-muted hover:text-ink",
          )}
        >
          {locale.toUpperCase()}
        </button>
      ))}
    </span>
  );
}
