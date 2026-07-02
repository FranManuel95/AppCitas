"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button className="btn-primary print:hidden" onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden />
      Imprimir / guardar PDF
    </button>
  );
}
