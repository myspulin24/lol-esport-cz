// Aplikace (PWA): manifest, ikony, seznam souborů pro service worker a pořadí nahrávání.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { precacheAssets, precacheData, SHELL_FILES, SHELL_PAGES, swSource } from '../scripts/make-sw.mjs';
import { phaseOf } from '../pipeline/deploy';

const PUBLIC = join('site', 'public');
const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.webmanifest'), 'utf8')) as {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  lang: string;
  background_color: string;
  theme_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
  shortcuts: Array<{ name: string; url: string }>;
};
const pageFile = (url: string) => join('site', 'src', 'pages', url === '/' ? 'index.astro' : `${url.replace(/^\/|\/$/g, '')}.astro`);

describe('manifest aplikace', () => {
  it('má vše, co prohlížeč potřebuje k instalaci', () => {
    expect(manifest.name).toBe('LoL esport česky');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12); // delší název se pod ikonou ořízne
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('cs');
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/);
    const png = manifest.icons.filter((i) => i.type === 'image/png');
    expect(png.some((i) => i.sizes === '192x192' && i.purpose === 'any')).toBe(true);
    expect(png.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
    expect(png.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
  });

  it('ikony existují a mají rozměr, který manifest uvádí', async () => {
    for (const icon of manifest.icons.filter((i) => i.type === 'image/png')) {
      const meta = await sharp(join(PUBLIC, icon.src)).metadata();
      expect(`${meta.width}x${meta.height}`, icon.src).toBe(icon.sizes);
    }
    const apple = await sharp(join(PUBLIC, 'icons', 'apple-touch-icon.png')).metadata();
    expect(`${apple.width}x${apple.height}`).toBe('180x180');
    expect(apple.hasAlpha ? (await sharp(join(PUBLIC, 'icons', 'apple-touch-icon.png')).stats()).isOpaque : true).toBe(true); // iPhone by průhledné pozadí vyplnil černou
  });

  it('zkratky vedou na stránky, které existují', () => {
    expect(manifest.shortcuts.length).toBeGreaterThan(0);
    for (const s of manifest.shortcuts) expect(existsSync(pageFile(s.url)), s.url).toBe(true);
  });
});

describe('service worker', () => {
  const template = readFileSync(join('site', 'sw.template.js'), 'utf8');
  const files = [
    'Base.AAAA.css',
    'page.BBBB.js',
    'ibm-plex-sans-latin-400-normal.CCCC.woff2',
    'ibm-plex-sans-latin-ext-400-normal.DDDD.woff2',
    'ibm-plex-sans-cyrillic-400-normal.EEEE.woff2',
    'ibm-plex-sans-latin-400-normal.FFFF.woff',
    'cinzel-latin-900-normal.GGGG.woff2',
  ];

  it('předem ukládá styly, skripty a písma pro latinku, ostatní písma ne', () => {
    expect(precacheAssets(files)).toEqual([
      '/_astro/Base.AAAA.css',
      '/_astro/cinzel-latin-900-normal.GGGG.woff2',
      '/_astro/ibm-plex-sans-latin-400-normal.CCCC.woff2',
      '/_astro/ibm-plex-sans-latin-ext-400-normal.DDDD.woff2',
      '/_astro/page.BBBB.js',
    ]);
  });

  it('předem ukládá data pro dashboard a výsledky, vlajky ne', () => {
    expect(precacheData(['meta.json', 'schedule/lec.json', 'schedule\\lck.json', 'flags/cz.svg', 'flags/x.json', 'poznamka.txt'])).toEqual(['/data/meta.json', '/data/schedule/lck.json', '/data/schedule/lec.json']);
  });

  it('verze se mění jen se seznamem souborů nebo se šablonou', () => {
    const a = swSource(template, ['/', ...precacheAssets(files)]);
    const same = swSource(template, ['/', ...precacheAssets(files)]);
    const other = swSource(template, ['/', ...precacheAssets([...files, 'nove.HHHH.css'])]);
    expect(a.version).toBe(same.version);
    expect(a.version).not.toBe(other.version);
    expect(a.source).toContain(`const VERSION = "${a.version}";`);
    expect(a.source).toContain('"/_astro/Base.AAAA.css"');
    expect(a.source).not.toContain('__PRECACHE__');
    expect(a.source).not.toContain('__VERSION__');
    expect(() => swSource('bez značek', [])).toThrow();
  });

  it('předem uložené stránky a soubory existují ve zdrojích', () => {
    expect(SHELL_PAGES).toContain('/');
    expect(SHELL_PAGES).toContain('/offline/');
    for (const p of SHELL_PAGES as string[]) expect(existsSync(pageFile(p)), p).toBe(true);
    for (const f of SHELL_FILES as string[]) expect(existsSync(join(PUBLIC, f)), f).toBe(true);
  });

  it('nahrává se až po stránkách a před meta.json', () => {
    const order = ['data/meta.json', 'sw.js', 'index.html', '_astro/a.css', 'data/x.json'].sort((a, b) => phaseOf(a) - phaseOf(b));
    expect(order).toEqual(['_astro/a.css', 'data/x.json', 'index.html', 'sw.js', 'data/meta.json']);
  });
});
