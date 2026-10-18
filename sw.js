/* Service worker: guarda la app completa en el celular para usarla sin internet.
   Al publicar, scripts/build.mjs reemplaza VERSION y ASSETS. Si cambia cualquier
   archivo, cambia VERSION y el celular descarga la versión nueva una sola vez. */
const VERSION = 'dev';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'data/routine.json', 'data/logros.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
const CACHE = `r2k-${VERSION}`;

self.addEventListener('install', (e) => {
  // cache: 'reload' = pedir cada archivo al servidor, sin la caché HTTP del navegador. Si no, al publicar
  // dos versiones seguidas (GitHub Pages pide guardar 10 min) se mezclaba el index.html nuevo con el app.js viejo.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('r2k-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

async function fromNetwork(req) {
  const res = await fetch(req);
  if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const key = req.mode === 'navigate' ? './' : req;
  if (VERSION === 'dev') {
    // En desarrollo: red primero, caché como respaldo.
    e.respondWith(fromNetwork(req).catch(() => caches.match(key, { ignoreSearch: true })));
    return;
  }
  // Publicado: caché primero (cero datos), red solo si falta algo.
  e.respondWith(caches.match(key, { ignoreSearch: true }).then((hit) => hit || fromNetwork(req)));
});
