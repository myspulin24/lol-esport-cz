// Přehled výsledků (D19): sloupce lig (≥ 900 px) / záložky lig (< 900 px), období.
// Období platí doslova: liga, která v něm nehrála, nedostane sloupec se staršími zápasy, jen zmínku pod přehledem.

import type { Match } from './types';
import { h, type Child, type VNode } from './vnode';
import { matchRow, coin, freshness, type RenderData } from './render';
import { dayKey, formatDate, pragueParts } from './format';
import { leagueName, leagueShort } from './leagues';

export type Period = 'week' | 'last-week' | 'split';
export const PERIOD_LABEL: Record<Period, string> = { week: 'Tento týden', 'last-week': 'Minulý týden', split: 'Celý split' };
/** Pořadí, ve kterém se hledá výchozí období: od nejčerstvějšího. */
export const PERIODS: Period[] = ['week', 'last-week', 'split'];

const EMPTY_TEXT: Record<Period, string> = {
  week: 'Tento týden se ve vybraných ligách nehraje.',
  'last-week': 'Minulý týden se ve vybraných ligách nehrálo.',
  split: 'Vybrané ligy zatím nemají žádné zápasy.',
};
const QUIET_LABEL: Record<Period, string> = { week: 'Tento týden bez zápasů', 'last-week': 'Minulý týden bez zápasů', split: 'Bez zápasů' };

/** Pondělí 00:00 (Praha) týdne s daným datem, jako klíč dne. */
export function weekRange(now: Date, offsetWeeks = 0): { from: string; to: string } {
  const p = pragueParts(now);
  const mondayOffset = (p.wd + 6) % 7; // po = 0
  const base = Date.UTC(p.y, p.m - 1, p.d) - mondayOffset * 86_400_000 + offsetWeeks * 7 * 86_400_000;
  const from = new Date(base).toISOString().slice(0, 10);
  const to = new Date(base + 6 * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

export function selectMatches(matches: Match[], period: Period, now: Date): Match[] {
  if (period === 'split') {
    const latest = [...matches].sort((a, b) => b.startTime.localeCompare(a.startTime)).find((m) => m.tournament)?.tournament;
    return matches.filter((m) => m.tournament === latest);
  }
  const { from, to } = weekRange(now, period === 'week' ? 0 : -1);
  return matches.filter((m) => {
    const d = dayKey(new Date(m.startTime));
    return d >= from && d <= to;
  });
}

/** Ligy rozdělené podle toho, jestli v období mají zápas. Pořadí zůstává. */
export function splitByActivity(leagues: string[], period: Period, schedule: Record<string, Match[] | undefined>, now: Date): { played: string[]; quiet: string[] } {
  const played = leagues.filter((l) => selectMatches(schedule[l] ?? [], period, now).length > 0);
  return { played, quiet: leagues.filter((l) => !played.includes(l)) };
}

/**
 * Výchozí období, dokud si návštěvník nevybere sám: první (tento týden → minulý týden → celý split),
 * ve kterém aspoň jedna z lig hrála. Mimo sezónu tak stránka nezačíná prázdná.
 */
export function firstPlayedPeriod(leagues: string[], schedule: Record<string, Match[] | undefined>, now: Date): Period {
  return PERIODS.find((p) => splitByActivity(leagues, p, schedule, now).played.length > 0) ?? 'week';
}

function byDay(ms: Match[], data: RenderData, league: string): Child[] {
  const groups = new Map<string, Match[]>();
  for (const m of [...ms].sort((a, b) => b.startTime.localeCompare(a.startTime))) {
    const k = dayKey(new Date(m.startTime));
    const list = groups.get(k) ?? [];
    list.push(m);
    groups.set(k, list);
  }
  // Jedna mřížka na ligu. V úzkém sloupci (víc lig vedle sebe) dny oddělují nadpisy přes celou šířku;
  // v širokém sloupci (jedna liga) se nadpisy schovají, destičky jdou za sebou ve více sloupcích a datum je na každé z nich.
  const items: Child[] = [];
  for (const list of groups.values()) {
    items.push(h('h3', { class: 'day' }, formatDate(list[0].startTime)));
    items.push(...list.sort((a, b) => a.startTime.localeCompare(b.startTime)).map((m) => matchRow(m, { now: data.now, showDate: true, streamers: data.streamers[league] })));
  }
  return [h('div', { class: 'mlist mlist--cards' }, ...items)];
}

export function resultsColumn(league: string, period: Period, data: RenderData, active: boolean): VNode {
  const sel = selectMatches(data.schedule[league] ?? [], period, data.now);
  return h(
    'section',
    { class: `res-col${active ? ' is-active' : ''}`, 'data-league': league, role: 'tabpanel', id: `col-${leagueShort(league)}`, 'aria-label': leagueName(league) },
    h('div', { class: 'tile-head' }, coin(data.leagues.find((l) => l.slug === league)?.image, 'm-coin m-coin--lg'), h('h2', null, h('a', { href: `/liga/${leagueShort(league)}/` }, leagueName(league))), freshness('lolesports', data.meta, data.now)),
    ...(sel.length ? byDay(sel, data, league) : [h('p', { class: 'empty' }, 'V tomto období se nehrálo.')]),
  );
}

/** Ligy, které v období nehrály: jen jména s odkazem na ligu, žádné starší zápasy. */
function quietStrip(quiet: string[], period: Period, data: RenderData): VNode {
  return h(
    'p',
    { class: 'res-quiet' },
    h('span', { class: 'res-quiet-label' }, QUIET_LABEL[period]),
    ...quiet.map((l) => h('a', { class: 'res-quiet-league', href: `/liga/${leagueShort(l)}/`, 'data-league': l }, coin(data.leagues.find((x) => x.slug === l)?.image), leagueName(l))),
  );
}

/** V období nehrála žádná z vybraných lig: říct to a nabídnout období, ve kterých se hrálo. */
function emptyState(leagues: string[], period: Period, data: RenderData): VNode {
  const others = PERIODS.filter((p) => p !== period && splitByActivity(leagues, p, data.schedule, data.now).played.length > 0);
  return h(
    'div',
    { class: 'slab res-empty' },
    h('p', { class: 'res-empty-text' }, EMPTY_TEXT[period]),
    others.length ? h('p', { class: 'res-empty-acts' }, ...others.map((p) => h('button', { type: 'button', class: 'btn', 'data-period': p }, PERIOD_LABEL[p]))) : null,
  );
}

export function resultsView(leagues: string[], period: Period, data: RenderData, activeLeague?: string): VNode[] {
  const { played, quiet } = splitByActivity(leagues, period, data.schedule, data.now);
  if (!played.length) return [emptyState(leagues, period, data)];
  const active = activeLeague && played.includes(activeLeague) ? activeLeague : played[0];
  const nodes: VNode[] = [];
  if (played.length > 1) {
    nodes.push(
      h(
        'div',
        { class: 'res-tabs', role: 'tablist', 'aria-label': 'Ligy se zápasy v tomto období' },
        ...played.map((l) =>
          h('button', { type: 'button', role: 'tab', 'aria-selected': l === active ? 'true' : 'false', 'aria-controls': `col-${leagueShort(l)}`, 'data-action': 'res-tab', 'data-league': l }, leagueName(l)),
        ),
      ),
    );
  }
  nodes.push(h('div', { class: 'res-cols' }, ...played.map((l) => resultsColumn(l, period, data, l === active))));
  if (quiet.length) nodes.push(quietStrip(quiet, period, data));
  return nodes;
}
