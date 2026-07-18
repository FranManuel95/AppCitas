"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Dict } from "@/lib/i18n/shared";

type PushLabels = Pick<
  Dict["myAppointments"],
  "pushEnable" | "pushDisable" | "pushHint" | "pushDenied" | "pushIosHint"
>;

// Convierte la clave pública VAPID (base64url) al Uint8Array que espera
// PushManager.subscribe.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Avisos push del navegador (PWA): recordatorios gratis en el móvil del
// cliente sin depender de WhatsApp/SMS. Solo se muestra si el navegador lo
// soporta y el servidor tiene claves VAPID configuradas.
export function PushOptIn({ labels }: { labels: PushLabels }) {
  const [state, setState] = useState<
    "unsupported" | "loading" | "off" | "on" | "denied" | "ios-install"
  >("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      // En iOS Safari, PushManager solo existe con la PWA instalada en la
      // pantalla de inicio (iOS 16.4+). En vez de ocultar el bloque sin
      // explicación, se guía al usuario a instalarla.
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as { standalone?: boolean }).standalone === true;
      setState(isIOS && !standalone ? "ios-install" : "unsupported");
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/me/push");
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok || !json.publicKey) {
        setState("unsupported");
        return;
      }
      setPublicKey(json.publicKey);
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      // "Suscrito" real de ESTE dispositivo, no solo del usuario
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      await fetch("/api/me/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
      });
      setState("on");
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/me/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "unsupported" || state === "loading") return null;
  if (state === "ios-install") {
    return <p className="text-xs text-ink-muted">{labels.pushIosHint}</p>;
  }
  if (state === "denied") {
    return <p className="text-xs text-ink-muted">{labels.pushDenied}</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={state === "on" ? disable : enable}
      >
        {state === "on" ? (
          <BellOff className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Bell className="h-3.5 w-3.5" aria-hidden />
        )}
        {state === "on" ? labels.pushDisable : labels.pushEnable}
      </Button>
      {state === "off" && (
        <span className="text-xs text-ink-muted">{labels.pushHint}</span>
      )}
    </div>
  );
}
