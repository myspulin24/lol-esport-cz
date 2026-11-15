// Přehled výsledků (D19): sloupce lig (≥ 900 px) / záložky lig (< 900 px), období, poslední odehrané mimo sezónu.

import type { Match } from './types';
import { h, type Child, type VNode } from './vnode';
import { matchRow, coin, freshness, type RenderData } from './render';
import { dayKey, formatDate, pragueParts } from './format';
import { leagueName, leagueShort } from './leagues';

export type Period = 'week' | 'last-week' | 'split';
export const PERIOD_LABEL: Record<Period, string> = { week: 'Tento týden', 'last-week': 'Minulý týden', split: 'Celý split' };

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

/** Poslední odehraný týden ligy (pro mimo sezónu). */
export function lastPlayed(matches: Match[]): Match[] {
  const done = matches.filter((m) => m.state === 'completed').sort((a, b) => b.startTime.localeCompare(a.startTime));
  if (!done.length) return [];
  const lastDay = new Date(done[0].startTime).getTime();
  return done.filter((m) => lastDay - new Date(m.startTime).getTime() <= 6 * 86_400_000);
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
  const all = data.schedule[league] ?? [];
  const sel = selectMatches(all, period, data.now);
  let body: Child[];
  if (sel.length) body = byDay(sel, data, league);
  else {
    const last = lastPlayed(all);
    body = last.length
      ? [
          h('p', { class: 'empty' }, period === 'split' ? 'Split zatím nezačal.' : 'V tomto období se nehrálo.'),
          h('p', { class: 'last-note' }, `Poslední odehrané: ${formatDate(last.at(-1)!.startTime)} – ${formatDate(last[0].startTime)}`),
          ...byDay(last, data, league),
        ]
      : [h('p', { class: 'empty' }, 'Zatím žádné zápasy.')];
  }
  return h(
    'section',
    { class: `res-col${active ? ' is-active' : ''}`, 'data-league': league, role: 'tabpanel', id: `col-${leagueShort(league)}`, 'aria-label': leagueName(league) },
    h('div', { class: 'tile-head' }, coin(data.leagues.find((l) => l.slug === league)?.image, 'm-coin m-coin--lg'), h('h2', null, h('a', { href: `/liga/${leagueShort(league)}/` }, leagueName(league))), freshness('lolesports', data.meta, data.now)),
    ...body,
  );
}

export function resultsView(leagues: string[], period: Period, data: RenderData, activeLeague?: string): VNode[] {
  const active = activeLeague && leagues.includes(activeLeague) ? activeLeague : leagues[0];
  return [
    h(
      'div',
      { class: 'res-tabs', role: 'tablist', 'aria-label': 'Vybrané ligy' },
      ...leagues.map((l) =>
        h('button', { type: 'button', role: 'tab', 'aria-selected': l === active ? 'true' : 'false', 'aria-controls': `col-${leagueShort(l)}`, 'data-action': 'res-tab', 'data-league': l }, leagueName(l)),
      ),
    ),
    h('div', { class: 'res-cols' }, ...leagues.map((l) => resultsColumn(l, period, data, l === active))),
  ];
}
