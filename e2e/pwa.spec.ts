import { expect, test, type Page } from '@playwright/test';
import { ready } from './helpers';

// Jediný soubor testů, kde service worker běží (jinde je vypnutý v playwright.config.ts).
test.use({ serviceWorkers: 'allow' });

/** Počká, až service worker stránku ovládá a doběhlo uložení toho, co stránka načetla. */
async function workerReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>((done) => navigator.serviceWorker.addEventListener('controllerchange', () => done(), { once: true }));
  });
  // stránky i data uložené při instalaci jsou na místě
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const shell = (await caches.keys()).find((k) => k.startsWith('lol-shell-'));
        if (!shell) return false;
        const cache = await caches.open(shell);
        const hits = await Promise.all(['/offline/', '/vysledky/', '/data/meta.json', '/data/catalog.json'].map((p) => cache.match(location.origin + p)));
        return hits.every(Boolean);
      }),
    )
    .toBe(true);
}

test('aplikace: manifest, ikony a service worker', async ({ page, request }) => {
  await page.goto('/');
  await ready(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  expect((await request.get('/icons/apple-touch-icon.png')).status()).toBe(200);

  await workerReady(page);
  const state = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state);
  expect(state).toBe('activated');
});

test('aplikace: bez připojení fungují navštívené i předem uložené stránky, ostatní ukážou stránku offline', async ({ page, context }) => {
  await page.goto('/');
  await ready(page);
  await workerReady(page);
  const tiles = await page.locator('[data-dash] [data-tile]').count();
  expect(tiles).toBeGreaterThan(0);

  await context.setOffline(true);

  // navštívená stránka: znovu se načte z uložené kopie, včetně dat pro dlaždice
  await page.reload();
  await ready(page);
  await expect(page.locator('[data-dash] [data-tile]')).toHaveCount(tiles);
  await expect(page.locator('.site-head')).toBeVisible();

  // stránka uložená předem při instalaci, i když ji člověk ještě neotevřel
  await page.goto('/prestupy/');
  await expect(page.locator('h1')).toHaveText('Přestupy');
  // ... a to i s daty: výsledky se vykreslí z rozpisů uložených při instalaci
  await page.goto('/vysledky/');
  await ready(page);
  await expect(page.locator('.res-col .match').first()).toBeVisible();

  // stránka, která uložená není
  await page.goto('/tym/tenhle-tym-neni-ulozeny/');
  await expect(page.locator('h1')).toHaveText('Bez připojení');
  await expect(page.locator('[data-action="retry"]')).toBeVisible();

  await context.setOffline(false);
});
