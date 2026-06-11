const CACHE = "bolao-fg-v1";
const ASSETS = ["./","./index.html","./app.js","./config.js","./manifest.webmanifest","./icon-192.png","./icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return; // Supabase e openfootball sempre pela rede
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
