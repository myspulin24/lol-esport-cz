import type { Page } from '@playwright/test';

/**
 * Počká, až je stránka připravená k ovládání: doběhl společný skript (html[data-js]) a případně se
 * vykreslil dashboard nebo přehled výsledků. Bez toho by test mohl kliknout dřív, než jsou navěšené obsluhy.
 */
export async function ready(page: Page): Promise<void> {
  await page.locator('html[data-js]').waitFor({ state: 'attached' });
  for (const sel of ['[data-dash]', '[data-results]']) {
    if (await page.locator(sel).count()) await page.locator(`${sel}[data-ready]`).waitFor({ state: 'attached' });
  }
}

/**
 * Chyby stránky: výjimky ve skriptech, chyby v konzoli a neúspěšné odpovědi našeho serveru.
 * Výpadek cizího serveru (loga týmů z lolesports) se nepočítá: web na něm nezávisí a test by kvůli němu kolísal.
 */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  const own = (url: string) => {
    try {
      return new URL(url).hostname === '127.0.0.1';
    } catch {
      return true;
    }
  };
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/i.test(m.text()) && !own(m.location().url)) return;
    errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && own(r.url())) errors.push(`${r.status()} ${r.url()}`);
  });
  return errors;
}
