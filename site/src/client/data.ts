// Načítání dat v prohlížeči. R12/D17: meta.json vždy bez cache (?t=), ostatní data s ?v=<buildId>.

import type { Meta } from '../../../shared/types';

let metaPromise: Promise<Meta> | undefined;
const cache = new Map<string, Promise<unknown>>();

function base(): string {
  return '/data/';
}

export async function getMeta(): Promise<Meta> {
  metaPromise ??= fetch(`${base()}meta.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error(`meta.json ${r.status}`);
    return r.json() as Promise<Meta>;
  });
  return metaPromise;
}

export async function getJson<T>(path: string, opts: { fresh?: boolean } = {}): Promise<T> {
  if (opts.fresh) {
    const r = await fetch(`${base()}${path}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return (await r.json()) as T;
  }
  if (!cache.has(path)) {
    cache.set(
      path,
      (async () => {
        const meta = await getMeta().catch(() => undefined);
        const v = meta?.buildId ?? 'dev';
        const url = `${base()}${path}?v=${encodeURIComponent(v)}`;
        try {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`${path} ${r.status}`);
          const data = await r.json();
          try {
            sessionStorage.setItem(`last:${path}`, JSON.stringify(data));
          } catch {
            /* plné úložiště nevadí */
          }
          return data;
        } catch (err) {
          // poslední platná data z této návštěvy (R13: prohlížeč drží poslední úspěšně načtená data)
          try {
            const last = sessionStorage.getItem(`last:${path}`);
            if (last) return JSON.parse(last);
          } catch {
            /* nic */
          }
          throw err;
        }
      })(),
    );
  }
  return cache.get(path) as Promise<T>;
}
