"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/lib/i18n/shared";

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
    <span className="flex items-center gap-1 text-xs">
      {(["es", "en"] as const).map((locale, i) => (
        <span key={locale} className="flex items-center gap-1">
          {i > 0 && <span className="text-slate-300">·</span>}
          <button
            onClick={() => setLocale(locale)}
            disabled={busy}
            className={
              locale === current
                ? "font-semibold text-slate-800"
                : "text-slate-400 hover:text-slate-700"
            }
          >
            {locale.toUpperCase()}
          </button>
        </span>
      ))}
    </span>
  );
}
