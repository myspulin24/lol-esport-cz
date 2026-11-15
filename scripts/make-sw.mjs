// Po buildu: z šablony site/sw.template.js vyrobí dist/sw.js se seznamem souborů k uložení předem a s verzí.
// Verze je otisk šablony a seznamu, takže se service worker vymění jen tehdy, když se změní styly, skripty,
// sada datových souborů nebo on sám; běžná obnova dat (každých 15 minut) ho nemění.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Stránky dostupné offline hned po instalaci, i když je člověk ještě nenavštívil. */
export const SHELL_PAGES = ['/', '/vysledky/', '/prestupy/', '/cesi/', '/hledat/', '/offline/'];
/** Soubory vzhledu mimo _astro/. */
export const SHELL_FILES = ['/manifest.webmanifest', '/favicon.svg', '/ring.svg', '/cursors/arrow.svg', '/cursors/pointer.svg', '/icons/icon-192.png'];

/**
 * Co uložit předem ze složky _astro/: styly, skripty a písma pro latinku (čeština je v latin a latin-ext).
 * Ostatní písma (azbuka, řečtina, vietnamština) se uloží, až když je nějaká stránka opravdu použije.
 */
export function precacheAssets(astroFiles) {
  return astroFiles
    .filter((f) => /\.(?:css|js)$/.test(f) || /-latin(?:-ext)?-\d+-normal\.[^.]+\.woff2$/.test(f))
    .sort()
    .map((f) => `/_astro/${f}`);
}

/**
 * Data pro dashboard a výsledky (rozpisy, tabulky, soupisky, pavouci, přestupy): bez nich by předem uložené
 * stránky offline neměly co ukázat. Jde o kopii z doby instalace; čerstvá data si worker ukládá při každé návštěvě.
 * Vlajky se neukládají předem (uloží se, až je stránka použije).
 */
export function precacheData(dataFiles) {
  return dataFiles
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => f.endsWith('.json') && !f.startsWith('flags/'))
    .sort()
    .map((f) => `/data/${f}`);
}

export function swSource(template, precache) {
  const version = createHash('sha256').update(template).update(JSON.stringify(precache)).digest('hex').slice(0, 12);
  if (!template.includes("'__VERSION__'") || !template.includes('__PRECACHE__')) throw new Error('šablona service workeru nemá značky __VERSION__ a __PRECACHE__');
  return { version, source: template.replace("'__VERSION__'", JSON.stringify(version)).replace('__PRECACHE__', JSON.stringify(precache)) };
}

function main() {
  const dist = 'dist';
  const astroDir = join(dist, '_astro');
  const dataDir = join(dist, 'data');
  if (!existsSync(astroDir)) throw new Error('dist/_astro neexistuje: nejdřív astro build');
  const pageFile = (p) => join(dist, p === '/' ? 'index.html' : join(p, 'index.html'));
  const missing = [...SHELL_PAGES.filter((p) => !existsSync(pageFile(p))), ...SHELL_FILES.filter((f) => !existsSync(join(dist, f)))];
  if (missing.length) throw new Error(`service worker: v buildu chybí ${missing.join(', ')}`);
  const data = existsSync(dataDir) ? precacheData(readdirSync(dataDir, { recursive: true }).map(String)) : [];
  const precache = [...SHELL_PAGES, ...SHELL_FILES, ...precacheAssets(readdirSync(astroDir)), ...data];
  const { version, source } = swSource(readFileSync(join('site', 'sw.template.js'), 'utf8'), precache);
  writeFileSync(join(dist, 'sw.js'), source);
  console.log(`service worker ${version}: ${precache.length} souborů předem (z toho ${data.length} datových)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
