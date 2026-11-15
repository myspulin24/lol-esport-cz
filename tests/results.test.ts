// Přehled výsledků: období platí doslova. Liga, která ve zvoleném období nehrála, nesmí ukázat starší zápasy.
import { describe, expect, it } from 'vitest';
import { firstPlayedPeriod, resultsView, selectMatches, splitByActivity } from '../shared/results';
import type { Match } from '../shared/types';
import type { RenderData } from '../shared/render';
import type { Child, VNode } from '../shared/vnode';

// neděle 15. 11. 2026 večer: „tento týden“ je 9.–15. 11., „minulý týden“ 2.–8. 11.
const NOW = new Date('2026-11-15T19:00:00Z');

function match(id: string, league: string, startTime: string, tournament: string): Match {
  return {
    id,
    league,
    tournament,
    startTime,
    state: 'completed',
    bestOf: 5,
    teams: [
      { code: 'AAA', name: 'Tým A', gameWins: 3, outcome: 'win' },
      { code: 'BBB', name: 'Tým B', gameWins: 1, outcome: 'loss' },
    ],
  };
}

const SCHEDULE: Record<string, Match[]> = {
  worlds: [match('w-semi', 'worlds', '2026-11-07T22:00:00Z', 'worlds_2026'), match('w-final', 'worlds', '2026-11-14T19:00:00Z', 'worlds_2026')],
  first_stand: [match('fs-final', 'first_stand', '2026-03-22T13:00:00Z', 'first_stand_2026')],
  lck: [match('lck-final', 'lck', '2026-09-13T05:00:00Z', 'lck_2026')],
};

function data(schedule: Record<string, Match[]> = SCHEDULE): RenderData {
  return { now: NOW, leagues: [], schedule, standings: {}, teams: {}, brackets: {}, streamers: {} };
}

function walk(nodes: Child[], visit: (n: VNode) => void): void {
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    visit(n);
    walk(n.children, visit);
  }
}
function find(nodes: Child[], pred: (n: VNode) => boolean): VNode[] {
  const out: VNode[] = [];
  walk(nodes, (n) => pred(n) && out.push(n));
  return out;
}
const hasClass = (cls: string) => (n: VNode) => String(n.attrs.class ?? '').split(' ').includes(cls);
function text(nodes: Child[]): string {
  let s = '';
  for (const n of nodes) s += typeof n === 'string' || typeof n === 'number' ? `${n} ` : n && typeof n === 'object' ? text(n.children) : '';
  return s;
}

describe('období ve výsledcích', () => {
  it('minulý týden vybere jen zápasy z minulého týdne', () => {
    expect(selectMatches(SCHEDULE.worlds, 'last-week', NOW).map((m) => m.id)).toEqual(['w-semi']);
    expect(selectMatches(SCHEDULE.worlds, 'week', NOW).map((m) => m.id)).toEqual(['w-final']);
    expect(selectMatches(SCHEDULE.first_stand, 'last-week', NOW)).toEqual([]);
  });

  it('rozdělí ligy na ty, které v období hrály, a ty, které ne', () => {
    expect(splitByActivity(['lck', 'first_stand', 'worlds'], 'last-week', SCHEDULE, NOW)).toEqual({ played: ['worlds'], quiet: ['lck', 'first_stand'] });
  });

  it('výchozí období je první, ve kterém se hrálo', () => {
    expect(firstPlayedPeriod(['worlds', 'lck'], SCHEDULE, NOW)).toBe('week');
    expect(firstPlayedPeriod(['lck'], SCHEDULE, NOW)).toBe('split');
    expect(firstPlayedPeriod(['lck'], { lck: [match('x', 'lck', '2026-11-03T10:00:00Z', 'lck_2026')] }, NOW)).toBe('last-week');
    expect(firstPlayedPeriod(['lck'], {}, NOW)).toBe('week');
  });
});

describe('zobrazení výsledků', () => {
  it('liga bez zápasů v období nemá sloupec ani starší zápasy, jen zmínku', () => {
    const nodes = resultsView(['lck', 'first_stand', 'worlds'], 'last-week', data());
    const cols = find(nodes, hasClass('res-col'));
    expect(cols.map((c) => c.attrs['data-league'])).toEqual(['worlds']);
    // jediný vykreslený zápas je semifinále z minulého týdne, nic ze září ani z března
    expect(find(nodes, hasClass('match'))).toHaveLength(1);
    expect(text(nodes)).not.toMatch(/Poslední odehrané/);
    const quiet = find(nodes, hasClass('res-quiet-league'));
    expect(quiet.map((q) => q.attrs['data-league'])).toEqual(['lck', 'first_stand']);
    expect(text(find(nodes, hasClass('res-quiet')))).toMatch(/Minulý týden bez zápasů/);
  });

  it('když v období nehrála žádná vybraná liga, nabídne období, ve kterých se hrálo', () => {
    const nodes = resultsView(['lck', 'first_stand'], 'last-week', data());
    expect(find(nodes, hasClass('res-col'))).toHaveLength(0);
    expect(find(nodes, hasClass('match'))).toHaveLength(0);
    expect(text(nodes)).toMatch(/Minulý týden se ve vybraných ligách nehrálo/);
    expect(find(nodes, (n) => n.tag === 'button').map((b) => b.attrs['data-period'])).toEqual(['split']);
  });

  it('celý split ukáže poslední turnaj každé ligy', () => {
    const nodes = resultsView(['lck', 'first_stand', 'worlds'], 'split', data());
    expect(find(nodes, hasClass('res-col')).map((c) => c.attrs['data-league'])).toEqual(['lck', 'first_stand', 'worlds']);
    expect(find(nodes, hasClass('res-quiet'))).toHaveLength(0);
  });

  it('záložky lig jsou jen tehdy, když je z čeho vybírat', () => {
    expect(find(resultsView(['worlds', 'lck'], 'week', data()), hasClass('res-tabs'))).toHaveLength(0);
    expect(find(resultsView(['worlds', 'lck'], 'split', data()), hasClass('res-tabs'))).toHaveLength(1);
  });
});
