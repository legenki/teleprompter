// The root of this site used to be the classic teleprompter, which registered a caching service worker here.
// This replacement removes it (and its caches) from returning visitors, then gets out of the way.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
