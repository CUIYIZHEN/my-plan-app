const CACHE_NAME = 'planner-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// Install: Cache core local assets gracefully (tolerant of individual failures)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of CORE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('[SW] Pre-caching asset failed, skipping:', asset, err);
        }
      }
    })
  );
  self.skipWaiting();
});

// Activate: Clean old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch: Network-First for HTML/Navigations, Stale-While-Revalidate for other assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  
  // Only handle GET requests and http/https protocols
  if (req.method !== 'GET' || !req.url.startsWith('http')) {
    return;
  }

  const isNavigation = req.mode === 'navigate' || (req.headers.get('accept') && req.headers.get('accept').includes('text/html'));

  if (isNavigation) {
    // Network-First with Cache Fallback for navigation/HTML
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(async () => {
          // Network failed, fallback to cache
          const cached = await caches.match(req);
          if (cached) return cached;
          return caches.match('./index.html') || caches.match('./');
        })
    );
  } else {
    // Stale-While-Revalidate for other resources (CDN scripts, manifests, etc.)
    event.respondWith(
      caches.match(req).then((cachedRes) => {
        const fetchPromise = fetch(req)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              const resClone = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
            }
            return networkRes;
          })
          .catch(() => {
            // Network failed, if no cached response, return cachedRes
            return cachedRes;
          });

        return cachedRes || fetchPromise;
      })
    );
  }
});
