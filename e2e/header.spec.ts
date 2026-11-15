import { expect, test } from '@playwright/test';
import { ready } from './helpers';

test('nabídka Ligy se zavře kliknutím mimo i klávesou Escape', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const menu = page.locator('details.leagues-menu');
  const panel = menu.locator('.menu-panel');

  await menu.locator('summary').click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('link', { name: /Hitpoint Masters/ })).toBeVisible();
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  await expect(panel).toBeHidden();

  await menu.locator('summary').click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('spoilery ovládá jediné tlačítko, které mění ikonu oka', async ({ page }) => {
  await page.goto('/vysledky/');
  await ready(page);
  const toggle = page.locator('[data-action="spoilers"]');
  await expect(toggle).toHaveCount(1);
  await expect(page.locator('[data-action="reveal-all"]')).toHaveCount(0);

  await expect(toggle.locator('.ic-eye')).toBeVisible();
  await expect(toggle.locator('.ic-eyeoff')).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle.locator('.ic-eyeoff')).toBeVisible();
  await expect(toggle.locator('.ic-eye')).toBeHidden();
  await toggle.click();
  await expect(toggle.locator('.ic-eye')).toBeVisible();
});
