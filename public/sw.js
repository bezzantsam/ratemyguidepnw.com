/* RateMyGuidePNW minimal PWA offline shell.
 * Privacy contract: never cache guide pages, reviews, auth, API, Supabase
 * responses, form drafts, or user-specific content. Navigations are online-only.
 */
const SHELL_CACHE = 'rmgpnw-offline-shell-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('rmgpnw-offline-shell-') && key !== SHELL_CACHE)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(request).catch(async () => {
      return (await caches.match(OFFLINE_URL)) ||
        new Response('Connection needed. Reload when online.', {
          status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}
        });
    })
  );
});
