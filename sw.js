// Bump this on every release so old caches are invalidated.
var CACHE_VERSION = 'v1.2.3-2026-05-09';
var CACHE_NAME = 'teleprompter:' + CACHE_VERSION;

// Files we want available offline. They are still revalidated on every
// fetch (network-first below), so a new deploy is picked up immediately
// when the user is online.
var PRECACHE = [
  './',
  './index.html',
  './assets/css/style.v122.css',
  './assets/css/theme.css',
  './assets/css/font-awesome.min.css',
  './assets/js/plugins.v122.js',
  './assets/js/script.v122.js',
  './manifest.json'
];

// Allow the page to ask a waiting SW to activate now.
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE);
    }).then(function() {
      // Activate this SW as soon as it's installed instead of
      // waiting for all old tabs to close.
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(event) {
  // Drop every cache that doesn't match the current version.
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  var req = event.request;

  // Only handle GET. Let POST/PUT/etc. go straight to network.
  if (req.method !== 'GET') {
    return;
  }

  var url = new URL(req.url);

  // Don't cache cross-origin (jQuery UI CDN, etc.) — let the browser
  // handle them with its own HTTP cache.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-first strategy: always try fresh, fall back to cache when
  // the user is offline. This guarantees that a deployed update is
  // visible on the next reload while still keeping the app installable.
  event.respondWith(
    fetch(req).then(function(response) {
      // Only cache OK same-origin responses.
      if (response && response.status === 200) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(req, copy);
        });
      }
      return response;
    }).catch(function() {
      return caches.match(req).then(function(cached) {
        return cached || caches.match('./index.html');
      });
    })
  );
});
