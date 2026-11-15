import { expect, test, type Page } from '@playwright/test';
import { collectErrors, ready } from './helpers';
import { encodeConfig } from '../shared/dashboard-schema';

const KEY = 'dashboard:v1';

const own = (page: Page) => page.evaluate((k) => localStorage.getItem(k), KEY);

test('výchozí dashboard: dlaždice se vykreslí bez chyb a přidaná dlaždice přežije obnovení', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await ready(page);
  const tiles = page.locator('[data-dash] [data-tile]');
  await expect(tiles.first()).toBeVisible();
  const before = await tiles.count();
  expect(before).toBeGreaterThanOrEqual(3);
  expect(await own(page)).toBeNull(); // výchozí dashboard se neukládá, dokud ho člověk nezmění

  await page.locator('[data-action="edit"]').click();
  await page.locator('.page-actions [data-action="catalog"], [data-action="catalog"]').first().click();
  await page.locator('[data-action="add"][data-type="results"]').click();
  await expect(tiles).toHaveCount(before + 1);

  await page.reload();

  await ready(page);
  await expect(page.locator('[data-dash] [data-tile]')).toHaveCount(before + 1);
  const saved = JSON.parse((await own(page)) ?? 'null');
  expect(saved.tiles.at(-1)).toMatchObject({ t: 'results' });
  expect(errors).toEqual([]);
});

test('sdílený odkaz nepřepíše vlastní dashboard, dokud ho člověk neuloží', async ({ page }) => {
  const errors = collectErrors(page);
  const mine = { v: 1, tiles: [{ t: 'czsk' }] };
  const shared = encodeConfig({ v: 1, tiles: [{ t: 'standings', p: 'lck' }, { t: 'transfers', p: 'all' }] });

  await page.goto('/');

  await ready(page);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(mine)] as const);
  await page.reload();
  await ready(page);
  await expect(page.locator('[data-dash] [data-tile]')).toHaveCount(1);

  await page.goto(`/#d=${shared}`);

  await ready(page);
  const bar = page.locator('[data-bar="shared"]');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('sdílený dashboard');
  await expect(page.locator('[data-dash] [data-tile]')).toHaveCount(2);
  expect(JSON.parse((await own(page)) ?? 'null')).toEqual(mine); // prohlížení nic neukládá

  await bar.getByRole('button', { name: 'Zpět na můj' }).click();
  await expect(page.locator('[data-dash] [data-tile]')).toHaveCount(1);
  expect(new URL(page.url()).hash).toBe('');

  await page.goto(`/#d=${shared}`);

  await ready(page);
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-bar="shared"]').getByRole('button', { name: 'Uložit jako můj' }).click();
  await expect(page.locator('[data-bar="shared"]')).toBeHidden();
  expect(JSON.parse((await own(page)) ?? 'null').tiles).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('poškozený odkaz ukáže upozornění a výchozí dashboard', async ({ page }) => {
  await page.goto('/#d=tohle-neni-dashboard');
  await ready(page);
  await expect(page.locator('[data-bar="note"]')).toContainText('Odkaz je poškozený');
  await expect(page.locator('[data-dash] [data-tile]').first()).toBeVisible();
});
