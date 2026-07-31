const CACHE_NAME = 'curelith-v1';
const urlsToCache = [
  '/',
  '/patient-dashboard.html',
  '/patient-login.html',
  '/manifest.json',
  '/assets/logo.png',
  '/assets/favicon-32x32.png',
  '/assets/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
