'use strict';
// Offline support for the installed AJOURA app (rules rewritten in v0.47, AJ-16).
// 1. Pages (navigation): network first, but at most WAIT ms when a saved copy exists; then the saved copy.
//    A server error also gives the saved copy. Pages from the network are not saved, so the saved page
//    always belongs to the same release as the saved files.
// 2. Files tagged with this release (?v=VERSION): straight from the saved copy, no network.
//    Files tagged with another release (a new page came from the network): network, so a page and its
//    files are always the same version; the saved copy only if the network fails.
// 3. Everything else (images, features.json): network first, at most WAIT ms when a saved copy exists;
//    successful network copies are saved.
// Install fetches every file with this release's tag, so the saved set is one release (the tag also
// bypasses GitHub's 10-minute cache). The user's own data (IndexedDB, localStorage) is never touched here.
// VERSION must match the ?v=ak-N tag in app.html; CACHE is ajoura-pwa-(N + 50). testit/test_offline.py checks both.
const VERSION = 'ak-40';
const CACHE = 'ajoura-pwa-90';
const WAIT = 3000;
const FILES = ['./', 'app.html', 'app.css', 'ajoura.css', 'app.js', 'pdf-writer.js', 'roles.js', 'roles.css', 'sync.js', 'features.json', 'car-render.js','car-shapes.js','car-images.js','car-models.js','video.js','tips.js','vehicles.js','i18n-sv.js','i18n.js','tutorial.js','share.js', 'install.js', 'historia.html', 'tietosuoja.html', 'index.html', 'logo.svg', 'mark.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

// Saved copies are keyed by address without the ?query, as before.
const key = url => { const u = new URL(url, self.location.href); u.search = ''; u.hash = ''; return u.href; };

// Resolves with the promise's value, or with the fallback if the promise takes longer than ms. The promise must not reject.
const first = (promise, fallback, ms) => new Promise(resolve => {
  const timer = setTimeout(() => resolve(fallback), ms);
  promise.then(value => { clearTimeout(timer); resolve(value); });
});

self.addEventListener('install', event => {
  // All files are fetched before anything is saved, so a failed install leaves no half-filled copy behind.
  event.waitUntil(Promise.all(FILES.map(file => {
    const url = new URL(file, self.location.href);
    url.searchParams.set('v', VERSION);
    return fetch(url, { cache: 'no-cache' }).then(response => {
      if (!response.ok) throw new Error(file + ': ' + response.status);
      return [key(url), response];
    });
  })).then(list => caches.open(CACHE).then(cache => Promise.all(list.map(([k, response]) => cache.put(k, response)))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('ajoura-pwa-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  // Let the browser stream large media (range requests) straight from the network.
  if (url.pathname.includes('/media/')) return;
  const k = key(url);
  const tag = url.searchParams.get('v') || '';
  const saved = () => caches.open(CACHE).then(cache => cache.match(k));

  if (request.mode === 'navigate') {
    const net = fetch(request);
    event.respondWith(saved().then(copy => {
      // A page without a saved copy waits for the network; offline it falls back to the app.
      if (!copy) return net.catch(() => caches.open(CACHE).then(cache => cache.match(key('app.html'))).then(hit => hit || Response.error()));
      return first(net.then(response => response.ok ? response : copy, () => copy), copy, WAIT);
    }));
    return;
  }

  if (tag === VERSION) {
    event.respondWith(saved().then(copy => copy || fetch(request)));
    return;
  }

  if (/^ak-/.test(tag)) {
    event.respondWith(fetch(request).catch(() => saved().then(copy => copy || Response.error())));
    return;
  }

  let saving = Promise.resolve();
  const net = fetch(request).then(response => {
    if (response.ok) { const copy = response.clone(); saving = caches.open(CACHE).then(cache => cache.put(k, copy)); }
    return response;
  });
  event.waitUntil(net.then(() => saving, () => {}).catch(() => {}));
  event.respondWith(saved().then(copy => {
    if (!copy) return net.catch(() => Response.error());
    return first(net.then(response => response.ok ? response : copy, () => copy), copy, WAIT);
  }));
});
