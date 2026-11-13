// Boarding Past offline support, so the page opens and works with no connection (on a plane):
// - the page: from the network when it answers within a few seconds (a newer build wins), else the saved copy
// - the app's own files, the map library, fonts and map styles: kept for good (styles refreshed in the background)
// - map tiles: every tile you have looked at, kept up to a limit (oldest dropped first), so maps you have seen work offline
const PAGE = "index.html", WORLD = "world_airports.js?v=57c399de27", TRACKS = "flight_tracks.js?v=07a0750e2a", ICONS = ["brand/app-icon/boarding-past-app-icon-rounded-192.png", "brand/app-icon/boarding-past-app-icon-rounded-512.png", "brand/app-icon/boarding-past-app-icon-512.png", "brand/app-icon/boarding-past-app-icon-1024.png"];
const APP = "boarding-past-app-v5", TILES = "boarding-past-tiles-v1", MAX_TILES = 3000, PAGE_WAIT = 4000;
const SHOTS = "boarding-past-trip-maps-v1";  // the trip maps' pictures, kept by the page itself: not cleared here
const LIBS = ["https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js", "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json", "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js", "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css"];  // the map library and country shapes, from the page's CDN list
const isTile = url => /\/\d+\/\d+\/\d+(@2x)?(\.(png|jpe?g|webp|pbf|mvt))?$/.test(url.pathname);
const isStyle = url => url.hostname === "tiles.openfreemap.org" || /\/(styles|fonts|sprites?)\//.test(url.pathname) || url.pathname.endsWith(".json") && url.origin !== location.origin && !url.pathname.includes("@");

self.addEventListener("install", e => {
  self.skipWaiting();
  // one missing file must not stop the rest being saved
  e.waitUntil(caches.open(APP).then(c => Promise.all([PAGE, WORLD, TRACKS, "manifest.webmanifest", ...ICONS, ...LIBS].map(u => c.add(u).catch(() => {})))));
});
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => (k.startsWith("boarding-past-") || k.startsWith("contreel-")) && k !== APP && k !== TILES && k !== SHOTS).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

let puts = 0;
async function keepTile(req, res) {
  const c = await caches.open(TILES);
  await c.put(req, res);
  if (++puts % 50) return;  // trim now and then, not on every tile
  const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_TILES))) await c.delete(k);
}
const save = (name, req, res) => caches.open(name).then(c => c.put(req, res)).catch(() => {});
const ok = r => r && (r.ok || r.type === "opaque");

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;
  // the page: network first, but not waiting forever on a weak connection
  if (url.origin === location.origin && (req.mode === "navigate" || url.pathname.endsWith("/" + PAGE))) {
    e.respondWith((async () => {
      const net = fetch(req).then(r => { if (r.ok) save(APP, PAGE, r.clone()); return r; });
      const late = new Promise(res => setTimeout(res, PAGE_WAIT));
      const first = await Promise.race([net.catch(() => null), late]);
      if (first) return first;
      return (await caches.match(PAGE)) || net;
    })());
    return;
  }
  // map tiles: saved copy first, else the network (and keep it)
  if (isTile(url)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (ok(r)) e.waitUntil(keepTile(req, r.clone())); return r; })));
    return;
  }
  // map styles, fonts and sprites: the saved copy at once, refreshed in the background for next time
  if (isStyle(url)) {
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(r => { if (ok(r)) save(APP, req, r.clone()); return r; });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net;
    }));
    return;
  }
  // everything else (versioned libraries, the airport list, logos, photos): saved copy first, else the network
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (ok(r)) save(APP, req, r.clone()); return r; })));
});
