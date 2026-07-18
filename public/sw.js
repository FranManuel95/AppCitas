// Service worker de AppCitas.
//
// 1) Push: recibe los avisos (confirmaciones y recordatorios) y abre la app.
// 2) Offline mínimo y SEGURO para una app dinámica con sesión: NUNCA se
//    cachean ni el HTML ni /api (podrían servirse datos de otra sesión o
//    quedarse obsoletos). Solo se precachea una página de "sin conexión" que
//    se muestra si una navegación falla, y los iconos estáticos van
//    cache-first. Esto además hace la PWA instalable en todas las rutas.

const CACHE = "appcitas-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Navegaciones: siempre red (contenido dinámico con sesión); si no hay
  // conexión, la página de "sin conexión" precacheada.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((hit) => hit ?? Response.error()),
      ),
    );
    return;
  }

  // Estáticos inmutables (iconos): cache-first.
  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          }),
      ),
    );
  }
  // Resto (API, assets con hash de Next…): red normal, sin interceptar.
});

self.addEventListener("push", (event) => {
  let data = { title: "AppCitas", body: "", url: "/mis-citas" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
