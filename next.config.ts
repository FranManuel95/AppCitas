import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // X-Frame-Options se emite en src/proxy.ts: DENY en toda la app
          // salvo el widget embebible /widget/{slug}.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          // Aísla el contexto de navegación de ventanas cross-origin (no usamos
          // popups OAuth ni embeds, así que es seguro y endurece frente a
          // XS-Leaks).
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // No filtrar destinos a terceros por DNS-prefetch.
          { key: "X-DNS-Prefetch-Control", value: "off" },
          // La Content-Security-Policy se emite en src/proxy.ts (necesita
          // un nonce por request); report-only por defecto, CSP_ENFORCE=true
          // para forzarla. Ver SECURITY.md.
        ],
      },
    ];
  },
};

export default nextConfig;
