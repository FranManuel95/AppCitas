import type { MetadataRoute } from "next";

// Manifest PWA: hace la web instalable (icono en el móvil, pantalla completa)
// y es el requisito para publicarla en Google Play como TWA (ver
// INTEGRACIONES-EXTERNAS.md). Los iconos "maskable" cubren la zona segura que
// exige Android para recortes redondos. `screenshots` se añaden cuando haya
// capturas reales (ver CHECKLIST-LANZAMIENTO): con arte falso restan.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "AppCitas — Reserva tu cita online",
    short_name: "AppCitas",
    description:
      "Reserva citas online en peluquerías, clínicas y negocios de servicios. Sin llamadas.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    // Debe coincidir con viewport.themeColor (layout.tsx) y con brand-600.
    theme_color: "#5b3fd6",
    lang: "es",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Reservar cita",
        url: "/",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Mis citas",
        url: "/mis-citas",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
