/**
 * EQ Studio — Service Worker v2
 * © Manik Roy 2026. All Rights Reserved.
 *
 * Strategies:
 *   App shell      → Cache First
 *   Google Fonts   → Stale While Revalidate
 *   Blob / Data    → Bypass (never cached)
 *   Everything else → Network First + cache fallback
 */

const CACHE      = 'eq-studio-v2';        // bump to invalidate old caches
const FONT_CACHE = 'eq-studio-fonts-v2';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ── Install ──────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(APP_SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge stale caches ─────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k !== FONT_CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol === 'blob:')             return;  // uploaded media
  if (url.protocol === 'data:')             return;  // inline data URIs
  if (url.protocol === 'chrome-extension:') return;

  // Google Fonts → stale-while-revalidate
  if (url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(FONT_CACHE, request));
    return;
  }

  // App shell files → cache first
  if (APP_SHELL.some(p => url.pathname.endsWith(p.replace('./', '/')))) {
    e.respondWith(cacheFirst(CACHE, request));
    return;
  }

  // Default → network first with cache fallback
  e.respondWith(networkFirst(CACHE, request));
});

// ── Strategies ───────────────────────────────────────────────────
async function cacheFirst(cacheName, request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) (await caches.open(cacheName)).put(request, res.clone());
    return res;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(cacheName, request) {
  try {
    const res = await fetch(request);
    if (res.ok) (await caches.open(cacheName)).put(request, res.clone());
    return res;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(cacheName, request) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fresh  = fetch(request)
    .then(r => { if (r.ok) cache.put(request, r.clone()); return r; })
    .catch(() => null);
  return cached || await fresh;
}

// ── Message handler (skipWaiting trigger from app) ───────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
