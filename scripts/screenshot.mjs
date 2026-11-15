// Snímky obrazovky lokálního náhledu (npm run preview):
//   node scripts/screenshot.mjs <cesta> <out.png> <šířka> [dark|light] [full|view] [akce]
// akce: menu (otevře Ligy), spoilers (zapne režim bez spoilerů), edit (režim úprav), expand (rozbalí první sérii),
//       hover (najede na první desku), roster-next (odhad soupisky), search:<text> (napíše do hledání)
import { chromium } from 'playwright';

const [, , path = '/', out = 'shot.png', width = '1280', scheme = 'dark', full = 'full', action = ''] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(width) < 600 ? 844 : 900 }, colorScheme: scheme });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://127.0.0.1:4321${path}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);
if (action === 'menu') await page.locator('.leagues-menu summary').click();
if (action === 'spoilers') await page.locator('[data-action="spoilers"]').click();
if (action === 'edit') await page.locator('[data-action="edit"]').click();
if (action === 'expand') await page.locator('.m-expand').first().click();
if (action === 'roster-next') await page.locator('[data-action="roster-tab"][data-tab="next"]').first().click();
if (action.startsWith('search:')) {
  await page.locator('#q').click();
  await page.locator('#q').pressSequentially(action.slice(7), { delay: 40 });
}
if (action === 'hover') {
  const box = await page.locator('.tile, .block, .res-col').nth(1).boundingBox();
  if (box) await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.25, { steps: 6 });
}
if (action) await page.waitForTimeout(700);
if (full === 'full') {
  // Celostránkový snímek mění velikost okna a tím znovu spouští úvodní animace: ukázat rovnou konečný stav.
  await page.addStyleTag({ content: '*, *::before, *::after { animation-delay: -30s !important; animation-iteration-count: 1 !important; }' });
  await page.waitForTimeout(200);
}
await page.screenshot({ path: out, fullPage: full === 'full' });
console.log(errors.length ? `ERRORS: ${errors.join(' | ')}` : 'no console errors');
await browser.close();
