// Service Worker PWA — Escuela Dominical 5ta ACyM
// Seguridad (docs/03-seguridad.md §6.2): lista blanca estricta; nunca cachear /api/*, ?_rsc=, RSC ni HTML privado.

const STATIC_CACHE = "ed-static-v1";
const PRECACHE_ALLOWLIST = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

function isAllowedStaticAsset(url, req) {
  if (req.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.searchParams.has("_rsc")) return false;
  if (req.headers.get("RSC") === "1" || req.headers.get("Next-Router-State-Tree")) return false;

  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/offline.html"
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ALLOWLIST))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegaciones HTML: siempre red directa (nunca Cache Storage para datos privados), con fallback a /offline.html.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        const offline = await caches.match("/offline.html");
        return offline || Response.error();
      }),
    );
    return;
  }

  if (!isAllowedStaticAsset(url, req)) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === "basic") {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, clone));
        }
        return res;
      });
    }),
  );
});

self.addEventListener("push", (event) => {
  const defaultTitle = "Escuela Dominical 5ta ACyM";
  const defaultBody = "Escuela Dominical: Nueva lección disponible para repasar en casa";

  let title = defaultTitle;
  let body = defaultBody;
  let url = "/";

  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data.title === "string" && data.title) title = data.title;
    if (data && typeof data.body === "string" && data.body) body = data.body;
    if (data && typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//")) url = data.url;
  } catch {
    // Usar mensaje neutro por defecto (docs/03-seguridad.md §6.4).
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "ed-weekly-lesson",
      renotify: false,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath =
    event.notification.data && typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : "/";
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
