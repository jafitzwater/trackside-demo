/* TrackStar Derby service worker (hand-written, no dependencies). Makes the built app work offline after the first load.
 *
 * - Precaches ONLY the app shell: index.html, the hashed JS/CSS it references, the manifest and the icons.
 * - Serves those from the cache, and every in-scope navigation (any hash route) with the cached index.html.
 * - Never caches anything else, and never touches cross-origin or out-of-scope requests.
 * - Version = the hashed main bundle name, passed by the page as ?v=…; each version gets its own cache.
 * - A new version waits until the user presses "Reload" in the app (message 'skip-waiting'). It never takes over by itself.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'unversioned';
const PREFIX = 'trackside-shell-';
const CACHE = PREFIX + VERSION;
const SCOPE = self.registration.scope; // ends with '/', e.g. https://<owner>.github.io/<repo>/
const STATIC = [
  'manifest.webmanifest',
  'favicon.svg',
  'apple-touch-icon.png',
  'icons/favicon-16.png',
  'icons/favicon-32.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const index = await fetch(new Request(SCOPE, { cache: 'reload' }));
      if (!index.ok) throw new Error(`index.html: HTTP ${index.status}`);
      const html = await index.clone().text();
      // The page asked for this version: index.html must be the build that has it (else retry on a later check).
      if (VERSION !== 'unversioned' && !html.includes(VERSION)) throw new Error(`index.html is not version ${VERSION}`);
      const refs = [...html.matchAll(/\b(?:src|href)="([^"#]+)"/g)].map((m) => new URL(m[1], SCOPE).href);
      const urls = [...new Set([...refs, ...STATIC.map((p) => new URL(p, SCOPE).href)])].filter((u) => u.startsWith(SCOPE));
      const cache = await caches.open(CACHE);
      await cache.addAll(urls.map((u) => new Request(u, { cache: 'reload' })));
      await cache.put(SCOPE, index);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      await self.clients.claim(); // first install: control the open page at once (no reload needed)
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting(); // only ever on the user's "Reload"
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE)) return; // cross-origin / out of scope: not ours
  if (req.mode === 'navigate') {
    // App shell: every route is a hash route of index.html.
    event.respondWith(caches.open(CACHE).then((c) => c.match(SCOPE)).then((r) => r || fetch(req)));
    return;
  }
  // Precached files from the cache; anything else goes to the network untouched (and is not cached).
  event.respondWith(caches.open(CACHE).then((c) => c.match(req)).then((r) => r || fetch(req)));
});
