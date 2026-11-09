/* CVICU Trainer service worker: lets the installed app (or the website) work without internet.
   - The app page is network-first: online you always get the newest version; offline you get the saved copy.
   - Everything else (icons, handout PDFs and page images) is served from the saved copy and refreshed in the
     background when online.
   - The page can ask it to save every handout ahead of time ({type:'cacheAll', urls}).
   Version: 20261109152901 (stamped by deploy.sh) */
const CACHE = 'cvicu-20261109152901';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-32.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = await caches.open(CACHE);
    for (const k of await caches.keys()) {
      if (k === CACHE || !k.startsWith('cvicu-')) continue;
      /* carry saved handouts over to the new version so offline copies survive app updates */
      const old = await caches.open(k);
      for (const req of await old.keys()) { if (!(await keep.match(req))) { const r = await old.match(req); if (r) await keep.put(req, r); } }
      await caches.delete(k);
    }
    await self.clients.claim();
  })());
});
const isPage = req => req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  if (isPage(req)) {
    e.respondWith((async () => {
      try {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
        const res = await fetch(req, { signal: ctl.signal, cache: 'no-cache' }); clearTimeout(t);
        if (res.ok) { const c = await caches.open(CACHE); c.put('index.html', res.clone()); c.put('./', res.clone()); }
        return res;
      } catch (err) {
        const c = await caches.open(CACHE);
        return (await c.match('index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }
  e.respondWith((async () => {
    const c = await caches.open(CACHE), hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || Response.error();
  })());
});
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'cacheAll' && Array.isArray(d.urls)) {
    e.waitUntil((async () => {
      const c = await caches.open(CACHE); let done = 0, failed = 0;
      for (const u of d.urls) {
        try { if (!(await c.match(u))) { const r = await fetch(u, { cache: 'no-cache' }); if (r.ok) await c.put(u, r); else failed++; } } catch (err) { failed++; }
        done++; if (e.source) e.source.postMessage({ type: 'cacheProgress', done, total: d.urls.length, failed });
      }
    })());
  }
});
