// Service worker webu (PWA): web jde nainstalovat jako aplikace a navštívené stránky fungují i bez připojení.
// Tento soubor je šablona. Po buildu do něj scripts/make-sw.mjs doplní seznam souborů k uložení předem a verzi
// (otisk toho seznamu a tohoto souboru) a výsledek zapíše jako dist/sw.js. Ručně se dist/sw.js neupravuje.
//
// Pravidla:
//   stránky a data   nejdřív síť, při výpadku (nebo pomalé síti) poslední uložená verze; web se mění každých 15 minut
//   /_astro/, vlajky soubory s otiskem v názvu se nemění: bere se uložená kopie
//   cizí servery     (loga a fotky z lolesports) se neukládají, řeší si je prohlížeč

const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;

const SHELL = `lol-shell-${VERSION}`; // uložené předem při instalaci; se změnou verze se vymění
const PAGES = 'lol-pages'; // navštívené stránky
const DATA = 'lol-data'; // /data/*.json
const STATIC = 'lol-static'; // písma, vlajky, obrázky webu
const LIMITS = { [PAGES]: 80, [DATA]: 150, [STATIC]: 200 };
const OFFLINE_URL = '/offline/';
const PAGE_TIMEOUT_MS = 4000;
const DATA_TIMEOUT_MS = 6000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Stránka pro offline je povinná; zbytek je „co se podaří“ (chybějící soubor nesmí instalaci zastavit).
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      await Promise.all(PRECACHE.filter((u) => u !== OFFLINE_URL).map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name.startsWith('lol-shell-') && name !== SHELL) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

/** Klíč v úložišti: adresa bez parametrů (?v=buildId, ?t=čas, ?l=liga), jinak by každý běh přidal nové kopie. */
const keyOf = (url) => url.origin + url.pathname;

async function put(cacheName, key, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return;
  const cache = await caches.open(cacheName);
  await cache.put(key, response);
  const limit = LIMITS[cacheName];
  if (!limit) return;
  const keys = await cache.keys();
  for (const old of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(old);
}

async function fromCaches(key, names) {
  for (const name of names) {
    const hit = await (await caches.open(name)).match(key);
    if (hit) return hit;
  }
  return undefined;
}

async function offlinePage() {
  return (await fromCaches(self.location.origin + OFFLINE_URL, [SHELL])) ?? new Response('Jsi offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

/**
 * Nejdřív síť. Když síť selže, nebo do `timeoutMs` neodpoví a uložená kopie existuje, vrátí se uložená kopie
 * (odpověď ze sítě se i tak uloží pro příště). `fallback` se použije, když není síť ani kopie.
 */
function networkFirst(event, cacheName, timeoutMs, fallback) {
  const key = keyOf(new URL(event.request.url));
  const cached = () => fromCaches(key, [cacheName, SHELL]);
  const fetched = fetch(event.request).then((res) => {
    event.waitUntil(put(cacheName, key, res.clone()));
    return res;
  });
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (res) => {
      if (done || !res) return false;
      done = true;
      resolve(res);
      return true;
    };
    const timer = setTimeout(async () => finish(await cached()), timeoutMs);
    fetched.then(
      (res) => {
        clearTimeout(timer);
        finish(res);
      },
      async (err) => {
        clearTimeout(timer);
        if (done) return;
        if (finish(await cached())) return;
        if (fallback) finish(await fallback());
        else reject(err);
      },
    );
  });
}

/** Uložená kopie, jinak síť (a uložit). Pro soubory, které se pod stejnou adresou nemění. */
async function cacheFirst(event, cacheName) {
  const key = keyOf(new URL(event.request.url));
  const hit = await fromCaches(key, [SHELL, cacheName]);
  if (hit) return hit;
  const res = await fetch(event.request);
  event.waitUntil(put(cacheName, key, res.clone()));
  return res;
}

/** Uložená kopie hned a na pozadí její obnovení; bez kopie síť. */
async function staleWhileRevalidate(event, cacheName) {
  const key = keyOf(new URL(event.request.url));
  const fresh = fetch(event.request).then((res) => {
    event.waitUntil(put(cacheName, key, res.clone()));
    return res;
  });
  const hit = await fromCaches(key, [cacheName, SHELL]);
  if (!hit) return fresh;
  event.waitUntil(fresh.catch(() => undefined));
  return hit;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  if (p === '/sw.js' || p.startsWith('/ics/')) return;
  if (req.mode === 'navigate') return event.respondWith(networkFirst(event, PAGES, PAGE_TIMEOUT_MS, offlinePage));
  if (p.startsWith('/_astro/') || p.startsWith('/data/flags/')) return event.respondWith(cacheFirst(event, STATIC));
  if (p.startsWith('/data/')) return event.respondWith(networkFirst(event, DATA, DATA_TIMEOUT_MS));
  if (/\.(?:svg|png|webmanifest|woff2?)$/.test(p)) return event.respondWith(staleWhileRevalidate(event, STATIC));
});

// Po první instalaci stránka pošle, co už si stáhla (styly, skripty, písma, data): uloží se to, aby právě
// otevřená stránka fungovala offline hned, ne až po další návštěvě.
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || msg.type !== 'warm' || !Array.isArray(msg.urls)) return;
  event.waitUntil(
    (async () => {
      for (const raw of msg.urls.slice(0, 200)) {
        let url;
        try {
          url = new URL(raw, self.location.origin);
        } catch {
          continue;
        }
        if (url.origin !== self.location.origin || url.pathname === '/sw.js') continue;
        const p = url.pathname;
        const name = p.startsWith('/data/') && !p.startsWith('/data/flags/') ? DATA : p.endsWith('/') || p.endsWith('.html') ? PAGES : STATIC;
        const key = keyOf(url);
        if (await fromCaches(key, [SHELL, name])) continue;
        try {
          await put(name, key, await fetch(url.href));
        } catch {
          /* bez připojení: zkusí se při další návštěvě */
        }
      }
    })(),
  );
});
