// Service Worker de PUNY 2026 INTEGRAL
// ----------------------------------------------------------------------------
// Estrategia (app Next.js con export estático, sin backend propio):
//  - Páginas (navegación): "network-first" — si hay internet, siempre trae la
//    versión más nueva y la deja en caché; si no hay internet, sirve la
//    última versión cacheada de esa pantalla (o el shell offline genérico si
//    nunca se visitó antes estando online).
//  - Assets estáticos (_next/static, íconos, fuentes): "cache-first" — son
//    inmutables (nombre de archivo con hash), no hace falta revalidar.
//  - Llamadas a Supabase (API/Auth/Realtime): NUNCA se tocan acá. El Service
//    Worker las deja pasar sin cachear; la cola de sincronización offline
//    (lib/offlineSync.ts) es la que decide qué hacer si fallan por falta de
//    conexión — mezclar ambas capas sería un lío de coherencia de datos.
// ----------------------------------------------------------------------------
const CACHE_VERSION = "puny-v1";
const PAGES_CACHE = `${CACHE_VERSION}-pages`;
const ASSETS_CACHE = `${CACHE_VERSION}-assets`;
const OFFLINE_FALLBACK_URL = "/offline.html";

const PRECACHE_URLS = [
  "/",
  "/login",
  OFFLINE_FALLBACK_URL,
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PAGES_CACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("puny-") && k !== PAGES_CACHE && k !== ASSETS_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function esLlamadaSupabase(url) {
  return url.hostname.endsWith(".supabase.co");
}

function esAssetEstatico(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(png|jpg|jpeg|svg|webp|woff2?|ico)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // mutaciones (POST/PATCH/etc) nunca pasan por el SW
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    if (esLlamadaSupabase(url)) return; // dejar pasar tal cual, sin cachear
    return;
  }

  if (esAssetEstatico(url)) {
    event.respondWith(
      caches.open(ASSETS_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // Navegación de páginas: network-first con fallback a caché / offline shell
  event.respondWith(
    caches.open(PAGES_CACHE).then(async (cache) => {
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        const fallback = await cache.match(OFFLINE_FALLBACK_URL);
        return fallback || Response.error();
      }
    })
  );
});
