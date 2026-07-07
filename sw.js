/**
 * Alculator — Service Worker
 *
 * Strategy: cache-first for all app assets.
 * To ship an update, bump CACHE_VERSION — the browser will install the new
 * worker and re-cache everything under the new name.  The new worker then
 * *waits* (it does not call skipWaiting on install) until the page tells it to
 * take over via a 'SKIP_WAITING' message — this is what the in-app "Update"
 * banner triggers.  On activation it deletes the old cache and claims clients,
 * and the page reloads on controllerchange to pick up the fresh assets.
 */

const CACHE_VERSION = 'v22';
const CACHE_NAME    = `alculator-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './index.js',
  './io/session_io.js',
  './model/absorption.js',
  './model/bac.js',
  './model/constants.js',
  './model/elimination.js',
  './model/food.js',
  './model/presets.js',
  './model/profile.js',
  './store/presets.js',
  './store/session.js',
  './ui/chart.js',
  './ui/display.js',
  './ui/form.js',
  './images/icon.svg',
  './images/icon-192.png',
  './images/icon-512.png',
];

// ── Install: pre-cache all app files ────────────────────────────────────────

self.addEventListener('install', event => {
  // Note: no skipWaiting() here — the new worker stays in the "waiting" state so
  // the page can surface an "Update available" prompt and let the user choose
  // when to switch.  The page activates it by posting 'SKIP_WAITING' (below).
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
});

// ── Message: allow the page to activate a waiting worker on demand ───────────

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── Activate: delete stale caches ───────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first, fall back to network ─────────────────────────────────

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});
