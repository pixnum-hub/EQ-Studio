/**
 * EQ Studio — Service Worker
 * © Manik Roy 2026. All Rights Reserved.
 *
 * Strategy:
 *   - App shell (HTML, CSS, JS, fonts) → Cache First
 *   - Media files (audio/video blobs) → Network Only (too large to cache)
 *   - Google Fonts → Stale While Revalidate
 *   - Offline fallback → cached app shell
 */

const CACHE_NAME     = 'eq-studio-v1';
const FONT_CACHE     = 'eq-studio-fonts-v1';
const DYNAMIC_CACHE  = 'eq-studio-dynamic-v1';

// App shell files to pre-cache on install
const APP_SHELL = [
  './media-player.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
];

// ── Install: pre-cache app shell ────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ───────────────────────────────
self.addEventListener('activate', event => {
  const currentCaches = [CACHE_NAME, FONT_CACHE, DYNAMIC_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => !currentCaches.includes(key))
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ──────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Blob URLs (uploaded media) → network only, no caching
  if (url.protocol === 'blob:') return;

  // Google Fonts → stale-while-revalidate
  if (url.origin === 'https://fonts.googleapis.com' ||
      url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(FONT_CACHE, request));
    return;
  }

  // App shell → cache first
  if (APP_SHELL.some(path => url.pathname.endsWith(path.replace('./', '')))) {
    event.respondWith(cacheFirst(CACHE_NAME, request));
    return;
  }

  // Icons and static assets → cache first
  if (url.pathname.includes('/icons/') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.webp')) {
    event.respondWith(cacheFirst(DYNAMIC_CACHE, request));
    return;
  }

  // Everything else → network first with cache fallback
  event.respondWith(networkFirst(DYNAMIC_CACHE, request));
});

// ── Cache strategies ─────────────────────────────────────────────

async function cacheFirst(cacheName, request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback();
  }
}

async function networkFirst(cacheName, request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback();
  }
}

async function staleWhileRevalidate(cacheName, request) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || await fetchPromise || offlineFallback();
}

function offlineFallback() {
  return caches.match('./media-player.html');
}

// ── Background media session (play/pause from OS media controls) ─
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
