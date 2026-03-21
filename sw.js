/**
 * Alculator — Service Worker
 *
 * Strategy: cache-first for all app assets.
 * To ship an update, bump CACHE_VERSION — the browser will
 * install the new worker, re-cache everything, then delete the old cache.
 */

const CACHE_VERSION = 'v19';
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
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
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
