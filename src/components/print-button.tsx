"use client";

import { Printer } from "lucide-react";

export function PrintButton({
  label = "Imprimir / guardar PDF",
}: {
  label?: string;
}) {
  return (
    <button className="btn-primary print:hidden" onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
