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

// Vlastní dashboard se nastaví ještě před načtením stránky, aby se rovnou vykreslil.
async function openWith(page: Page, tiles: Array<{ t: string; p?: string }>): Promise<void> {
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify({ v: 1, tiles })] as const);
  await page.goto('/');
  await ready(page);
}

test('soupiska týmu: tým jde vyhledat a vybrat', async ({ page }) => {
  const errors = collectErrors(page);
  const teams = (await (await page.request.get('/data/catalog.json')).json()).teams as Array<{ id: string; label: string }>;
  const [first, other] = teams;
  const name = (label: string) => label.replace(/\s*\([^)]*\)\s*$/, '');
  await openWith(page, [{ t: 'roster', p: first.id }]);
  await page.locator('[data-action="edit"]').click();

  const input = page.locator('.tile--roster .pick-input');
  await expect(input).toHaveValue(first.label);
  // kliknutí otevře nabídku se všemi týmy, psaní v ní hledá
  await input.click();
  const panel = page.locator('.tile--roster .pick-panel');
  await expect(panel).toBeVisible();
  expect(await panel.locator('.sr-item').count()).toBe(teams.length);
  await input.fill(name(other.label));
  await expect(panel.locator('.sr-label').first()).toHaveText(name(other.label));
  await panel.locator('.sr-item').first().click();

  await expect(page.locator('.tile--roster .pick-input')).toHaveValue(other.label);
  const saved = JSON.parse((await own(page)) ?? 'null');
  expect(saved.tiles[0]).toEqual({ t: 'roster', p: other.id });

  // rozepsané hledání se klávesou Escape zahodí a v poli zůstane vybraný tým
  await page.locator('.tile--roster .pick-input').click();
  await page.keyboard.type('zzz');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tile--roster .pick-input')).toHaveValue(other.label);
  await expect(page.locator('.tile--roster .pick-panel')).toBeHidden();
  expect(errors).toEqual([]);
});

test('pavouk: zápasy nepřetékají z dlaždice a play-off na dvě prohry má horní a dolní část', async ({ page }) => {
  const errors = collectErrors(page);
  const tournaments = (await (await page.request.get('/data/tournaments.json')).json()) as Array<{ slug: string }>;
  test.skip(!tournaments.length, 'v datech teď není žádný turnaj s pavoukem');
  await openWith(page, [{ t: 'czsk' }, ...tournaments.map((t) => ({ t: 'bracket', p: t.slug }))]);

  const tiles = page.locator('.tile--bracket');
  await expect(tiles).toHaveCount(tournaments.length);
  for (let i = 0; i < tournaments.length; i++) {
    const tile = tiles.nth(i);
    // nic nesmí přečnívat z dlaždice; co se nevejde, je uvnitř posuvné mřížky kol
    const outside = await tile.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return [...node.querySelectorAll<HTMLElement>('.bm')].filter((bm) => {
        const scroller = bm.closest<HTMLElement>('.br-grid');
        const clip = scroller ? scroller.getBoundingClientRect() : box;
        const r = bm.getBoundingClientRect();
        // buňka je buď celá v dlaždici, nebo ji ořezává posuvná mřížka
        const visibleRight = Math.min(r.right, clip.right);
        return visibleRight > box.right + 1 || r.left < box.left - 1;
      }).length;
    });
    expect(outside, `pavouk ${tournaments[i].slug}`).toBe(0);
    // kód týmu ani skóre nelezou z buňky zápasu
    const spill = await tile.evaluate((node) =>
      [...node.querySelectorAll<HTMLElement>('.bm')].filter((bm) => {
        const r = bm.getBoundingClientRect();
        return [...bm.querySelectorAll<HTMLElement>('.bm-code, .bm-sp')].some((x) => x.getBoundingClientRect().right > r.right + 1 || x.getBoundingClientRect().left < r.left - 1);
      }).length,
    );
    expect(spill, `buňky pavouka ${tournaments[i].slug}`).toBe(0);
  }

  // MSI se hraje na dvě prohry: 14 zápasů v horním a dolním pavouku a velké finále
  const double = page.locator('.bracket--double');
  if (await double.count()) {
    await expect(double.first().locator('.br-part--upper .bm').first()).toBeVisible();
    await expect(double.first().locator('.br-part--lower .bm').first()).toBeVisible();
    await expect(double.first().locator('.br-part--final .bm')).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test('starty lig: sousední dlaždice jsou jedna deska, při úpravách každá zvlášť', async ({ page }) => {
  await openWith(page, [{ t: 'countdown', p: 'lec' }, { t: 'countdown', p: 'lck' }, { t: 'czsk' }]);
  await expect(page.locator('.strip')).toHaveCount(1);
  await expect(page.locator('.strip .cd-card')).toHaveCount(2);
  await page.locator('[data-action="edit"]').click();
  await expect(page.locator('.strip')).toHaveCount(2);
  // volba „všechny soutěže“ ukáže všechny sledované ligy po skupinách
  await page.locator('.strip').first().locator('select[data-action="tile-param"]').selectOption('');
  await expect(page.locator('.strip').first().locator('.cd-group')).not.toHaveCount(0);
});
