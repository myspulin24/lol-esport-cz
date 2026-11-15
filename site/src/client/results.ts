// Přehled výsledků v prohlížeči (D19): výběr lig (spodní panel na mobilu), období, záložky / sloupce.

import type { LeagueInfo, Match, Meta } from '../../../shared/types';
import { firstPlayedPeriod, resultsView, type Period } from '../../../shared/results';
import { DEFAULT_RESULTS_LEAGUES, LEAGUE_BY_SHORT, TRACKED_LEAGUES, leagueShort } from '../../../shared/leagues';
import type { RenderData, Streamer } from '../../../shared/render';
import { mount } from '../../../shared/vnode';
import { getJson, getMeta } from './data';
import { refreshFreshness } from './common';
import { introClock } from './fx';
import { track } from './analytics';

const LKEY = 'results:leagues';
const PKEY = 'results:period';

let leagues: string[] = [];
/** Období, které si návštěvník sám vybral. Dokud žádné nevybral, bere se první, ve kterém se hrálo. */
let period: Period | undefined;
let active: string | undefined;

function save(): void {
  try {
    localStorage.setItem(LKEY, JSON.stringify(leagues));
    if (period) localStorage.setItem(PKEY, period);
  } catch {
    /* nic */
  }
}

function restore(): void {
  const q = new URLSearchParams(location.search).get('l');
  const fromQuery = q ? LEAGUE_BY_SHORT.get(q)?.slug : undefined;
  try {
    const raw = localStorage.getItem(LKEY);
    const saved = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(saved)) leagues = saved.filter((x): x is string => typeof x === 'string' && TRACKED_LEAGUES.some((l) => l.slug === x));
    const p = localStorage.getItem(PKEY);
    if (p === 'week' || p === 'last-week' || p === 'split') period = p;
  } catch {
    /* nic */
  }
  if (!leagues.length) leagues = [...DEFAULT_RESULTS_LEAGUES];
  if (fromQuery) {
    if (!leagues.includes(fromQuery)) leagues = [fromQuery, ...leagues];
    active = fromQuery;
  }
}

function syncControls(shown: Period | undefined): void {
  for (const box of document.querySelectorAll<HTMLInputElement>('[data-league-box]')) box.checked = leagues.includes(box.value);
  // Jen přepínač období; tlačítka v prázdném stavu mají data-period také, ale nejsou přepínač.
  if (shown) for (const b of document.querySelectorAll<HTMLButtonElement>('.seg [data-period]')) b.setAttribute('aria-pressed', String(b.dataset.period === shown));
  const count = document.querySelector('[data-league-count]');
  if (count) count.textContent = String(leagues.length);
}

async function render(): Promise<void> {
  const el = document.querySelector<HTMLElement>('[data-results]');
  if (!el) return;
  syncControls(period);
  // Bez vlastní volby období se přepínač ukáže, až je z dat jasné, které období platí.
  if (period || !leagues.length) document.querySelector('.res-controls')?.setAttribute('data-ready', '');
  if (!leagues.length) {
    el.textContent = 'Vyber aspoň jednu ligu.';
    el.setAttribute('data-ready', '');
    return;
  }
  const [meta, streamers, leagueInfo] = await Promise.all([
    getMeta().catch(() => undefined as Meta | undefined),
    getJson<Record<string, Streamer[]>>('streamers.json').catch(() => ({})),
    getJson<LeagueInfo[]>('leagues.json').catch(() => [] as LeagueInfo[]),
  ]);
  const schedule: Record<string, Match[]> = {};
  await Promise.all(
    leagues.map(async (l) => {
      schedule[l] = await getJson<Match[]>(`schedule/${leagueShort(l)}.json`).catch(() => []);
    }),
  );
  const data: RenderData = { now: new Date(), meta, leagues: leagueInfo, schedule, standings: {}, teams: {}, brackets: {}, streamers };
  const shown = period ?? firstPlayedPeriod(leagues, schedule, data.now);
  syncControls(shown);
  document.querySelector('.res-controls')?.setAttribute('data-ready', '');
  introClock(el);
  mount(el, resultsView(leagues, shown, data, active));
  el.setAttribute('data-ready', '');
  void refreshFreshness(meta);
}

export function initResults(): void {
  restore();
  document.addEventListener('change', (e) => {
    const box = (e.target as Element).closest<HTMLInputElement>('[data-league-box]');
    if (!box) return;
    leagues = box.checked ? [...new Set([...leagues, box.value])] : leagues.filter((l) => l !== box.value);
    leagues = TRACKED_LEAGUES.map((l) => l.slug).filter((s) => leagues.includes(s));
    save();
    track('vyber-lig', box.value);
    void render();
  });
  document.addEventListener('click', (e) => {
    const t = (e.target as Element).closest<HTMLElement>('[data-period], [data-action="res-tab"], [data-action="sheet"], [data-action="sheet-close"]');
    if (!t) return;
    if (t.dataset.period) {
      period = t.dataset.period as Period;
      save();
      void render();
    } else if (t.dataset.action === 'res-tab') {
      active = t.dataset.league;
      document.querySelectorAll('[data-action="res-tab"]').forEach((b) => b.setAttribute('aria-selected', String(b === t)));
      document.querySelectorAll<HTMLElement>('.res-col').forEach((c) => c.classList.toggle('is-active', c.dataset.league === active));
    } else if (t.dataset.action === 'sheet' || t.dataset.action === 'sheet-close') {
      const sheet = document.querySelector<HTMLElement>('[data-sheet]');
      if (sheet) {
        sheet.hidden = t.dataset.action === 'sheet-close';
        if (!sheet.hidden) sheet.querySelector<HTMLElement>('input')?.focus();
      }
    }
  });
  void render();
}
