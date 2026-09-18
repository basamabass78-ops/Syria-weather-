const CACHE_NAME = 'syria-weather-v2.1';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './phase2.1.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .catch(err => console.error('Core cache installation failed:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = request.url;

  // API/radar/map resources stay online-only.
  if (
    url.includes('api.open-meteo.com') ||
    url.includes('geocoding-api.open-meteo.com') ||
    url.includes('nominatim.openstreetmap.org') ||
    url.includes('rainviewer.com') ||
    url.includes('tile.openstreetmap.org') ||
    url.includes('tilecache.rainviewer.com') ||
    url.includes('unpkg.com') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com')
  ) return;

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});
