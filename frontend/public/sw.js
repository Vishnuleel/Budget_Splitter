/* Splitkvitto service worker — makes the home-screen app open instantly and work offline.
 * - App shell (index.html): network first, cached copy when offline.
 * - Built assets (/assets/*, hashed filenames): cache first.
 * - Google Fonts: stale-while-revalidate.
 * - Everything else (Supabase, /api, exchange rates): straight to the network, never cached,
 *   so you never see stale balances.
 */
const VERSION = 'v3'; // bump to refresh cached icons/shell after a redesign
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const FONTS = `fonts-${VERSION}`;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL).then(c => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/apple-touch-icon.png'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  const keep = [SHELL, ASSETS, FONTS];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Page loads: try the network (fresh deploys), fall back to the cached shell offline.
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  if (url.origin === self.location.origin && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(ASSETS).then(c => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONTS).then(async cache => {
        const hit = await cache.match(req);
        const network = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || network;
      }),
    );
  }
  // Anything else: default browser behaviour (network).
});
