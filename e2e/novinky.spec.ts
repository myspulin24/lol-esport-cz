import { expect, test } from '@playwright/test';
import { ready } from './helpers';

test('našeptávač hledání: vlastní panel, šipky a Enter', async ({ page }, info) => {
  test.skip(info.project.name === 'mobil', 'pole v hlavičce je jen na širší obrazovce; mobil má stránku Hledat');
  await page.goto('/');
  await ready(page);
  const input = page.locator('#q');
  const panel = page.locator('#q-list');
  await expect(panel).toBeHidden();

  await input.click();
  await input.pressSequentially('g2');
  await expect(panel).toBeVisible();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  const first = panel.locator('.sr-item').first();
  await expect(first).toContainText('G2 Esports');
  await expect(first.locator('.sr-kind')).toHaveText('tým');
  expect(await panel.locator('.sr-item').count()).toBeGreaterThan(1); // tým a jeho hráči

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await input.pressSequentially(' ');
  await expect(panel).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(first).toHaveClass(/is-active/);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/tym\/g2-esports\/$/);
});

test('stránka Hledat ukazuje výsledky rovnou při psaní', async ({ page }) => {
  await page.goto('/hledat/');
  await ready(page);
  const input = page.locator('#q2');
  await input.fill('lec');
  const first = page.locator('#q2-list .sr-item').first();
  await expect(first).toContainText('LEC');
  await first.click();
  await expect(page).toHaveURL(/\/liga\/lec\/$/);
});

test('soupiska týmu: přepínač aktuální / odhad na další split', async ({ page }) => {
  await page.goto('/tym/g2-esports/');
  await ready(page);
  const box = page.locator('[data-roster]').first();
  const now = box.locator('[data-pane="now"]');
  const next = box.locator('[data-pane="next"]');
  await expect(now).toBeVisible();
  await expect(next).toBeHidden();
  expect(await now.locator('.lu-role').count()).toBeGreaterThanOrEqual(5); // sestava: pět pozic
  await expect(now.locator('.lu-card').first()).toBeVisible();

  await box.getByRole('tab', { name: /Další split/ }).click();
  await expect(next).toBeVisible();
  await expect(now).toBeHidden();
  await expect(next.locator('.proj-note')).toContainText('soupisk');
  expect(await next.locator('.lu-role').count()).toBeGreaterThanOrEqual(5); // odhad sestavy: pět pozic
  // Na širší obrazovce jsou všechny karty v odhadu stejně vysoké (hráč, který zůstává, i ten, kdo možná odejde nebo přijde).
  const heights = await next.locator('.lu-card').evaluateAll((cards) => cards.map((c) => Math.round(c.getBoundingClientRect().height)));
  if ((page.viewportSize()?.width ?? 0) >= 1000) expect(new Set(heights).size).toBe(1);
  // přehled pohybů: kam hráči odcházejí a kdo může přijít
  await expect(next.locator('.mv-sec--out')).toContainText('Odchody');
  await expect(next.locator('.mv-sec--in')).toContainText('Příchody');

  await box.getByRole('tab', { name: 'Aktuální' }).click();
  await expect(now).toBeVisible();
});

test('detail zápasu: ze skóre ve výsledcích na stránku s jednotlivými hrami', async ({ page }) => {
  await page.goto('/vysledky/');
  await ready(page);
  await page.locator('.res-col:visible .match.is-final:has(.m-expand) a.m-status').first().click();
  await expect(page).toHaveURL(/\/zapas\/\d+\/$/);
  await ready(page);
  await expect(page.locator('.mh')).toBeVisible();
  const game = page.locator('.games .game').first();
  await expect(game).toContainText('Hra 1');
  await expect(game.locator('.g-row')).toHaveCount(5); // pět pozic v sestavě
  await expect(game.locator('.g-stat').first()).toBeVisible();

  // Režim bez spoilerů: průběh je rozmazaný, dokud ho člověk neodkryje.
  const blurred = () => page.locator('.spoil-box .sp-block').evaluate((el) => getComputedStyle(el).filter);
  expect(await blurred()).toBe('none');
  await page.locator('[data-action="spoilers"]').click();
  expect(await blurred()).toContain('blur');
  await expect(page.locator('.mh .sp-v')).toBeHidden();
  await page.locator('.spoil-box .sp-reveal').click();
  expect(await blurred()).toBe('none');
});
