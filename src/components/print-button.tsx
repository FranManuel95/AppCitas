"use client";

export function PrintButton() {
  return (
    <button className="btn-primary print:hidden" onClick={() => window.print()}>
      Imprimir / guardar PDF
    </button>
  );
}
