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
          { key: "X-Frame-Options", value: "DENY" },
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
          // (No se añade Content-Security-Policy aquí: una CSP estricta en Next
          // requiere nonces por request para los scripts de hidratación y hay
          // que afinarla por app; queda como endurecimiento posterior.)
        ],
      },
    ];
  },
};

export default nextConfig;
