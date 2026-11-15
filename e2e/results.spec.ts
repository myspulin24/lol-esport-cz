import { expect, test } from '@playwright/test';
import { collectErrors, ready } from './helpers';

test('výsledky: rozbalení her a režim bez spoilerů', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/vysledky/');
  await ready(page);

  const match = page.locator('.res-col:visible .match.is-final:has(.m-expand)').first();
  await expect(match).toBeVisible();
  const expand = match.locator('.m-expand');
  await expand.click();
  await expect(expand).toHaveAttribute('aria-expanded', 'true');
  await expect(match.locator('.m-games')).toBeVisible();
  await expect(match.locator('.m-games')).toContainText('Hra 1');

  // Režim bez spoilerů: skóre zmizí, kliknutím se odkryje jen jeden zápas.
  await page.locator('[data-action="spoilers"]').click();
  await expect(page.locator('html')).toHaveClass(/spoilers/);
  const score = match.locator('.m-status .sp-v');
  await expect(score).toBeHidden();
  const other = page.locator('.res-col:visible .match.is-final').nth(1).locator('.m-status .sp-v');
  await match.locator('.m-status .sp').click();
  await expect(score).toBeVisible();
  await expect(other).toBeHidden();

  // Volba přežije obnovení stránky.
  await page.reload();
  await ready(page);
  await expect(page.locator('html')).toHaveClass(/spoilers/);
  await expect(page.locator('.res-col:visible .match.is-final .m-status .sp-v').first()).toBeHidden();
  expect(errors).toEqual([]);
});

test('výsledky: výběr ligy se zapamatuje', async ({ page }, info) => {
  test.skip(info.project.name === 'mobil', 'na mobilu se ligy vybírají v panelu, pokrývá desktop');
  await page.goto('/vysledky/');
  await ready(page);
  const box = () => page.locator('label:visible').filter({ hasText: /^LCS$/ }).locator('input');
  await box().check();
  await expect(page.locator('.res-col[data-league="lcs"] h2')).toBeVisible();
  await page.reload();
  await ready(page);
  await expect(box()).toBeChecked();
  await expect(page.locator('.res-col[data-league="lcs"]')).toBeVisible();
});
