"use client";

import { useState } from "react";
import { Check, Code2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Snippet del widget embebible: el negocio lo pega en su web (WordPress,
// Wix, HTML propio) y sus visitantes reservan sin salir de su página.
export function EmbedSnippetCard({
  baseUrl,
  slug,
}: {
  baseUrl: string;
  slug: string;
}) {
  const [copied, setCopied] = useState(false);
  const snippet = `<iframe src="${baseUrl}/widget/${slug}" title="Reservar cita" style="width:100%;max-width:420px;height:420px;border:0;border-radius:16px" loading="lazy"></iframe>`;

  async function copy() {
    await navigator.clipboard.writeText(snippet).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="print:hidden">
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        <Code2 className="h-4 w-4 text-ink-muted" aria-hidden />
        Botón de reservas para tu web
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Pega este código en tu página (WordPress, Wix, HTML…) y tus visitantes
        verán tus servicios con un botón de reservar, con tu color y tu logo.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-surface-3 p-3 text-xs leading-relaxed text-ink-soft">
        {snippet}
      </pre>
      <Button variant="secondary" size="sm" className="mt-3" onClick={copy}>
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success-strong" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        )}
        {copied ? "Copiado" : "Copiar código"}
      </Button>
    </Card>
  );
}
