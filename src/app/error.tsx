"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";

// Error boundary de la app. Texto en español sin i18n: el diccionario se
// resuelve en el servidor y este límite debe renderizar aunque aquello falle.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-24">
      <Card className="w-full max-w-md p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-warning-soft text-warning-strong">
          <AlertTriangle className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-5 text-lg font-semibold text-ink">
          Algo ha ido mal
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Se ha producido un error inesperado. Puedes reintentarlo; si el
          problema continúa, vuelve a intentarlo en unos minutos.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button type="button" className="btn-primary" onClick={() => reset()}>
            Reintentar
          </button>
          <Link href="/" className="btn-secondary">
            Volver al inicio
          </Link>
        </div>
      </Card>
    </main>
  );
}
