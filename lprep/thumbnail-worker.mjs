import { THUMBNAIL_CACHE } from './lprep-thumbnail-cache.mjs';

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

async function cachedImage(request) {
  try {
    const cache = await caches.open(THUMBNAIL_CACHE);
    const existing = await cache.match(request);
    if (existing) return existing;
    const response = await fetch(request);
    if (!response.ok && response.type !== 'opaque') return Response.error();
    await cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  if (event.request.destination === 'image' && event.request.method === 'GET' && /^https?:/.test(event.request.url)) {
    event.respondWith(cachedImage(event.request));
  }
});
