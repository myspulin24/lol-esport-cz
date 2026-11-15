// Společné chování všech stránek: režim, spoilery (D11), rozbalení her, kola pavouku (D22),
// štítky čerstvosti + varovná lišta (D10), hledání (D5), analytika kanálů (premisa 1).

import type { Meta } from '../../../shared/types';
import { formatAgo } from '../../../shared/format';
import { STALE_HOURS } from '../../../shared/render';
import { getJson } from './data';
import { track } from './analytics';
import { initSearch } from './search';

const root = document.documentElement;

function store(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* localStorage nemusí být dostupný */
  }
}

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// ---------- režim ----------
function currentTheme(): 'light' | 'dark' {
  const forced = root.dataset.theme;
  if (forced === 'light' || forced === 'dark') return forced;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function initTheme(): void {
  const btn = document.querySelector<HTMLButtonElement>('[data-action="theme"]');
  if (!btn) return;
  const sync = () => {
    const t = currentTheme();
    btn.setAttribute('aria-label', t === 'dark' ? 'Přepnout na světlý režim' : 'Přepnout na tmavý režim');
    btn.title = btn.getAttribute('aria-label') ?? '';
  };
  sync();
  btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    store('theme', next);
    sync();
  });
}

// ---------- spoilery (D11) ----------
export function spoilersOn(): boolean {
  return root.classList.contains('spoilers');
}

function syncSpoilerUi(): void {
  const on = spoilersOn();
  document.querySelector('[data-action="spoilers"]')?.setAttribute('aria-pressed', String(on));
  const all = document.querySelector<HTMLButtonElement>('[data-action="reveal-all"]');
  if (all) all.hidden = !on;
  // skryté skóre jako tlačítko s popisem (D21)
  for (const sp of document.querySelectorAll<HTMLElement>('[data-spoiler] .sp')) {
    if (on && !sp.closest('[data-spoiler]')?.classList.contains('revealed')) {
      sp.setAttribute('role', 'button');
      sp.tabIndex = 0;
      sp.setAttribute('aria-label', sp.dataset.spLabel ?? 'Odkrýt skóre');
    } else {
      sp.removeAttribute('role');
      sp.removeAttribute('tabindex');
      sp.removeAttribute('aria-label');
    }
  }
}

function reveal(el: Element | null): void {
  if (!el) return;
  el.classList.add('revealed');
  syncSpoilerUi();
}

function initSpoilers(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as Element;
    const toggle = target.closest('[data-action="spoilers"]');
    if (toggle) {
      root.classList.toggle('spoilers');
      store('spoilers', spoilersOn() ? 'hide' : null);
      for (const r of document.querySelectorAll('.revealed')) r.classList.remove('revealed');
      syncSpoilerUi();
      return;
    }
    if (target.closest('[data-action="reveal-all"]')) {
      for (const s of document.querySelectorAll('[data-spoiler], .standings')) s.classList.add('revealed');
      syncSpoilerUi();
      return;
    }
    if (!spoilersOn()) return;
    const sp = target.closest('.sp, .sp-name, [data-action="reveal"]');
    if (sp) {
      e.preventDefault();
      reveal(sp.closest('[data-spoiler], .standings'));
    }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as Element).classList?.contains('sp') && spoilersOn()) {
      e.preventDefault();
      reveal((e.target as Element).closest('[data-spoiler]'));
    }
  });
  syncSpoilerUi();
}

// ---------- rozbalení her, přepínač soupisky ----------
function initDelegates(): void {
  document.addEventListener('click', (e) => {
    const t = e.target as Element;
    const exp = t.closest<HTMLButtonElement>('[data-action="expand"]');
    if (exp) {
      const list = document.getElementById(exp.getAttribute('aria-controls') ?? '');
      if (list) {
        const open = exp.getAttribute('aria-expanded') === 'true';
        exp.setAttribute('aria-expanded', String(!open));
        list.hidden = open;
      }
      return;
    }
    // mezinárodní turnaje: přepínač pavouků v široké dlaždici
    const bracketTab = t.closest<HTMLButtonElement>('[data-action="bracket-tab"]');
    if (bracketTab) {
      const box = bracketTab.closest('.tile--bracket');
      box?.querySelectorAll('[data-action="bracket-tab"]').forEach((b) => b.setAttribute('aria-selected', String(b === bracketTab)));
      box?.querySelectorAll<HTMLElement>('[data-bpane]').forEach((p) => (p.hidden = p.dataset.bpane !== bracketTab.dataset.tab));
      return;
    }
    // soupiska: aktuální / odhad na další split
    const rosterTab = t.closest<HTMLButtonElement>('[data-action="roster-tab"]');
    if (rosterTab) {
      const box = rosterTab.closest('[data-roster]');
      box?.querySelectorAll('[data-action="roster-tab"]').forEach((b) => b.setAttribute('aria-selected', String(b === rosterTab)));
      box?.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== rosterTab.dataset.tab));
      return;
    }
  });
}

// ---------- čerstvost (D10) ----------
const SOURCE_TOPIC: Record<string, string> = {
  lolesports: 'Zápasy, výsledky a tabulky',
  leaguepedia: 'Přestupy a Češi a Slováci',
};

export async function refreshFreshness(meta?: Meta): Promise<void> {
  const m = meta ?? (await getJson<Meta>('meta.json', { fresh: true }).catch(() => undefined));
  if (!m) return;
  const now = new Date();
  for (const el of document.querySelectorAll<HTMLElement>('.fresh[data-src]')) {
    const last = m.sources[el.dataset.src as keyof Meta['sources']]?.lastSuccess;
    el.textContent = formatAgo(last, now);
    el.classList.toggle('fresh--stale', !last || now.getTime() - Date.parse(last) > STALE_HOURS * 3_600_000);
  }
  const stale = Object.entries(m.sources)
    .filter(([, s]) => !s.lastSuccess || now.getTime() - Date.parse(s.lastSuccess) > STALE_HOURS * 3_600_000)
    .map(([k, s]) => `${SOURCE_TOPIC[k] ?? k} jsou ${formatAgo(s.lastSuccess, now).replace('před ', '')} stará, zdroj neodpovídá.`);
  const bar = document.querySelector<HTMLElement>('[data-stale-bar]');
  const text = document.querySelector<HTMLElement>('[data-stale-text]');
  if (bar && text) {
    text.textContent = stale.join(' ');
    bar.hidden = stale.length === 0;
  }
}

export function initCommon(): void {
  initTheme();
  initSpoilers();
  initDelegates();
  initSearch();
  void refreshFreshness();
  setInterval(() => void refreshFreshness(), 5 * 60_000);
  track('pageview');
}
