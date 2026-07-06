import type { MetadataRoute } from "next";

// Manifest PWA: hace la web instalable (icono en el móvil, pantalla completa)
// y es el requisito para publicarla en Google Play como TWA (ver
// INTEGRACIONES-EXTERNAS.md). Los iconos "maskable" cubren la zona segura que
// exige Android para recortes redondos.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AppCitas — Reserva tu cita online",
    short_name: "AppCitas",
    description:
      "Reserva citas online en peluquerías, clínicas y negocios de servicios. Sin llamadas.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    lang: "es",
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
  };
}
