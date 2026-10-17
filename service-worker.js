const CACHE_NAME = 'mybible-shell-v115';
const APP_SHELL = [
  './',
  './index.html',
  './chronology.html',
  './data/people_chronology.json',
  './styles.css',
  './app.js',
  './config.js',
  './backend.js',
  './auth.js',
  './auth.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(resp => {
        if (resp.ok) {
          const copy = resp.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(req, copy)));
        }
        return resp;
      }).catch(async () => {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (url.pathname.endsWith('/chronology.html')) {
          const fallback = await caches.match('./chronology.html');
          if (fallback) return fallback;
          return Response.error();
        }
        return (await caches.match('./index.html')) || Response.error();
      })
    );
    return;
  }

  // The chronology dataset is versioned and may receive corrections.
  // Prefer a fresh response when online while retaining the offline copy.
  if (url.pathname.endsWith('/data/people_chronology.json')) {
    event.respondWith(
      fetch(req).then(resp => {
        if (resp.ok) {
          const copy = resp.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(req, copy)));
        }
        return resp;
      }).catch(async () => (await caches.match(req)) || Response.error())
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        if (resp.ok) {
          const copy = resp.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(req, copy)));
        }
        return resp;
      });
    })
  );
});