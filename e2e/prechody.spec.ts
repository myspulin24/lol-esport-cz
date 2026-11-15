import { expect, test, type Page } from '@playwright/test';
import { ready } from './helpers';

/** Úhel otočení runového kruhu na pozadí (stupně 0–360). */
async function ringAngle(page: Page): Promise<number> {
  return page.evaluate(() => {
    const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.scene-ring--a .ring-img')!).transform);
    return ((Math.atan2(m.b, m.a) * 180) / Math.PI + 360) % 360;
  });
}

/** Počká, až jsou na stránce načtené styly (kruh má svou animaci); bez toho by měření četlo nulový úhel. */
async function stylesReady(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await page.waitForFunction(() => {
    const ring = document.querySelector('.scene-ring--a .ring-img');
    return !!ring && getComputedStyle(ring).animationName === 'spin';
  });
}

/** Běžící úvodní animace desek a řádků (při přechodu mezi stránkami nesmí běžet žádná). */
async function runningIntro(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.tile, .block, .res-col, .slab, .match, .tr, .cz, .page-head')]
      .flatMap((el) => el.getAnimations())
      .filter((a) => a.playState === 'running')
      .map((a) => (a as CSSAnimation).animationName),
  );
}

test('přechod mezi stránkami: úvodní animace se neopakuje a pozadí plynule pokračuje', async ({ page }, info) => {
  test.skip(info.project.name === 'mobil', 'horní navigace je jen na širší obrazovce; chování je stejné');
  await page.goto('/');
  await ready(page);
  await expect(page.locator('html')).not.toHaveClass(/\bnav\b/); // první příchod: úvod se přehraje

  await stylesReady(page);
  await page.waitForTimeout(1500);
  const before = await ringAngle(page);
  const t0 = Date.now();

  await page.locator('.top-nav a[href="/vysledky/"]').click();
  await expect(page).toHaveURL(/\/vysledky\/$/);
  await expect(page.locator('html')).toHaveClass(/\bnav\b/);
  await stylesReady(page);
  expect(await runningIntro(page)).toEqual([]);

  // Kruh se otáčí 360° za 190 s podle hodin: po přechodu musí být tam, kde by byl bez přechodu.
  const after = await ringAngle(page);
  const expected = (before + ((Date.now() - t0) / 1000) * (360 / 190)) % 360;
  const diff = Math.abs(((after - expected + 540) % 360) - 180);
  expect(diff).toBeLessThan(2);

  await page.locator('.top-nav a[href="/prestupy/"]').click();
  await expect(page).toHaveURL(/\/prestupy\/$/);
  await stylesReady(page);
  expect(await runningIntro(page)).toEqual([]);
});

test('vlastní dashboard se při návratu neukáže nejdřív ve výchozí podobě', async ({ page }) => {
  await page.goto('/vysledky/');
  await ready(page);
  await page.evaluate(() => localStorage.setItem('dashboard:v1', JSON.stringify({ v: 1, tiles: [{ t: 'czsk' }] })));
  // Hned po načtení HTML (než doběhne skript) si zapamatujeme, jestli je výchozí dashboard vidět.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const dash = document.querySelector('[data-dash]');
      (window as unknown as { __early: string }).__early = dash && !dash.hasAttribute('data-ready') ? getComputedStyle(dash).visibility : 'ready';
    });
  });
  await page.goto('/');
  await ready(page);
  const dash = page.locator('[data-dash]');
  await expect(dash).toHaveAttribute('data-ready', '');
  await expect(dash.locator('[data-tile]')).toHaveCount(1);
  await expect(dash).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __early: string }).__early)).not.toBe('visible');
});
