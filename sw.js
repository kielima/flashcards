const CACHE_NAME = 'fsrs-app-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/db.js',
  './js/fsrs.js',
  './js/ui.js',
  './js/views/home.js',
  './js/views/library.js',
  './js/views/editor.js',
  './js/views/review.js',
  './js/views/settings.js',
  './js/views/typing.js',
  './decks/hsk1-mandarim.deck.json',
  './js/components/card-renderer.js',
  './js/components/modal.js',
  './js/components/toast.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css',
  'https://cdn.jsdelivr.net/npm/katex@0.16/+esm',
  'https://cdn.jsdelivr.net/npm/marked@12/+esm',
  'https://cdn.jsdelivr.net/npm/dexie@4/+esm',
  'https://cdn.jsdelivr.net/npm/ts-fsrs@4/+esm'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(ASSETS.map(url => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(response => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      }
      return response;
    }))
  );
});
