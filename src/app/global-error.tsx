"use client";

import { useEffect } from "react";

// Límite de error GLOBAL: sustituye al root layout cuando el fallo ocurre en
// el propio layout, así que debe emitir su <html>/<body> y no puede depender
// de globals.css ni de componentes propios (estilos inline a propósito).
export default function GlobalError({
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
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          background: "#fafafa",
          color: "#1a1a1a",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <p
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#5b3fd6",
              letterSpacing: "0.02em",
            }}
          >
            AppCitas
          </p>
          <h1 style={{ fontSize: "1.25rem", margin: "0.75rem 0 0" }}>
            Algo ha ido mal
          </h1>
          <p
            style={{
              fontSize: "0.9rem",
              lineHeight: 1.6,
              color: "#555",
              margin: "0.75rem 0 1.5rem",
            }}
          >
            Se ha producido un error inesperado. Reintenta en unos segundos; si
            el problema continúa, vuelve más tarde.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "#5b3fd6",
              color: "#fff",
              border: 0,
              borderRadius: "0.5rem",
              padding: "0.6rem 1.25rem",
              fontSize: "0.9rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
