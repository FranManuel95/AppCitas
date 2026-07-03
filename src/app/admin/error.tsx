"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";

// Error boundary del panel de administración: al vivir dentro de admin/layout,
// conserva el chrome (barra lateral, cabecera) y solo sustituye el contenido,
// para no dejar al dueño en una pantalla vacía ante un fallo puntual. Texto en
// español sin i18n: el diccionario se resuelve en servidor y este límite debe
// renderizar aunque aquello falle.
export default function AdminError({
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
    <div className="px-1 py-8">
      <Card className="mx-auto max-w-md p-8 text-center" role="alert">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-warning-soft text-warning-strong">
          <AlertTriangle className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-5 text-lg font-semibold text-ink">
          No se pudo cargar esta sección
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Se ha producido un error inesperado. Puedes reintentarlo sin salir del
          panel; si continúa, inténtalo de nuevo en unos minutos.
        </p>
        <div className="mt-6 flex justify-center">
          <button type="button" className="btn-primary" onClick={() => reset()}>
            Reintentar
          </button>
        </div>
      </Card>
    </div>
  );
}
