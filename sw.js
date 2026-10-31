// Contreel offline support: the page itself network-first (a newer build wins, the saved copy works offline); scripts,
// fonts, logos, photos and map tiles cache-first, kept to a reasonable number
const CACHE = "contreel-v1", PAGE = "main.html", MAX_ITEMS = 1500;
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll([PAGE, "manifest.webmanifest"]))); });
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ITEMS))) await cache.delete(k);
}
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin && (req.mode === "navigate" || url.pathname.endsWith(PAGE))) {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(PAGE, copy)); return r; })
      .catch(() => caches.match(PAGE)));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy).then(() => trim(c))); }
    return r;
  })));
});
