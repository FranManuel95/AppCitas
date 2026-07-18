"use client";

import { useEffect } from "react";

// Registra el service worker en TODAS las rutas (antes solo se registraba al
// activar los avisos push en /mis-citas, así que Chrome no ofrecía instalar la
// PWA en el resto de la app). register() es idempotente: si ya existe, no hace
// nada; push-optin sigue funcionando igual sobre el mismo registro.
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // fail-open: sin SW la web funciona igual (solo pierde instalación/offline)
    });
  }, []);
  return null;
}
