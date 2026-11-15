// Starty lig: stav ligy (hraje se / začne za N dní / termín není znám) a deska na dashboardu.
import { describe, expect, it } from 'vitest';
import { leagueStart, renderDashboard, startsBoard, type RenderData } from '../shared/render';
import { validateConfig } from '../shared/dashboard-schema';
import type { Catalog, LeagueInfo, Match } from '../shared/types';
import type { Child, VNode } from '../shared/vnode';

const NOW = new Date('2026-11-15T19:00:00Z');
const league = (slug: string, group: LeagueInfo['group'], extra: Partial<LeagueInfo> = {}): LeagueInfo => ({ slug, name: slug.toUpperCase(), region: '', group, ...extra });

const LEAGUES: LeagueInfo[] = [
  league('lck', 'major', { currentName: 'LCK 2026 Split 3', currentStart: '2026-07-28', currentEnd: '2026-09-13' }),
  league('lpl', 'major', { currentName: 'LPL 2026 Split 3', currentStart: '2026-07-21', currentEnd: '2026-09-19', nextName: 'LPL 2027 Split 1', nextStart: '2027-01-12' }),
  league('lec', 'major', { currentName: 'LEC 2026 Split 3', currentStart: '2026-07-23', currentEnd: '2026-09-20', nextName: 'LEC 2027 zima', nextStart: '2026-12-01' }),
  league('worlds', 'international', { currentName: 'Worlds 2026', currentStart: '2026-10-15', currentEnd: '2026-11-15' }),
  league('msi', 'international', { currentName: 'MSI 2026', currentStart: '2026-06-27', currentEnd: '2026-07-12' }),
];
const done = (l: string): Match => ({ id: '1', league: l, startTime: '2026-11-14T19:00:00Z', state: 'completed', bestOf: 5, teams: [{ code: 'A', name: 'A' }, { code: 'B', name: 'B' }] });
const data = (upcoming: Match[] = [done('worlds')]): RenderData => ({ now: NOW, leagues: LEAGUES, upcoming, schedule: {}, standings: {}, teams: {}, brackets: {}, streamers: {} });

function find(nodes: Child[], pred: (n: VNode) => boolean): VNode[] {
  const out: VNode[] = [];
  const walk = (list: Child[]) => {
    for (const n of list) {
      if (!n || typeof n !== 'object') continue;
      if (pred(n)) out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
const hasClass = (cls: string) => (n: VNode) => String(n.attrs.class ?? '').split(' ').includes(cls);
const cardLeagues = (nodes: Child[]) => find(nodes, hasClass('cd-card')).map((c) => c.attrs['data-league']);

describe('stav ligy', () => {
  const info = (slug: string) => LEAGUES.find((l) => l.slug === slug);

  it('známý termín: počet dní do startu', () => {
    expect(leagueStart(info('lec'), data())).toEqual({ kind: 'soon', days: 16, date: '2026-12-01', name: 'LEC 2027 zima' });
  });

  it('neznámý termín: poslední turnaj a kdy skončil', () => {
    expect(leagueStart(info('lck'), data())).toEqual({ kind: 'unknown', lastName: 'LCK 2026 Split 3', lastEnd: '2026-09-13' });
    expect(leagueStart(undefined, data())).toEqual({ kind: 'unknown', lastName: undefined, lastEnd: undefined });
  });

  it('turnaj v termínu se hraje, dokud v rozpisu zbývá neodehraný zápas', () => {
    const open: Match = { ...done('worlds'), id: '2', state: 'unstarted' };
    expect(leagueStart(info('worlds'), data([done('worlds'), open])).kind).toBe('running');
    // poslední den turnaje podle rozpisu, ale finále už je odehrané
    expect(leagueStart(info('worlds'), data([done('worlds')])).kind).toBe('unknown');
    // bez zápasů v rozpisu rozhoduje jen termín
    expect(leagueStart(info('worlds'), data([])).kind).toBe('running');
  });

  it('start, který už nastal, znamená, že se hraje', () => {
    const later = { ...data(), now: new Date('2026-12-02T10:00:00Z') };
    expect(leagueStart(info('lec'), later).kind).toBe('running');
  });
});

describe('deska startů', () => {
  it('všechny ligy: skupiny, v nich napřed nejbližší start, neznámé termíny nakonec', () => {
    const board = startsBoard(null, data());
    expect(find([board], hasClass('cd-group-name')).map((g) => g.children.join(''))).toEqual(['Hlavní ligy', 'Regionální ligy', 'Mezinárodní turnaje']);
    const major = find([board], hasClass('cd-group'))[0];
    expect(cardLeagues([major]).slice(0, 2)).toEqual(['lec', 'lpl']);
  });

  it('vybrané ligy: jen ony, v zadaném pořadí a bez skupin', () => {
    const board = startsBoard(['lck', 'lec'], data());
    expect(cardLeagues([board])).toEqual(['lck', 'lec']);
    expect(find([board], hasClass('cd-group'))).toHaveLength(0);
  });
});

describe('starty lig na dashboardu', () => {
  const tiles = [{ t: 'countdown' as const, p: 'lec' }, { t: 'countdown' as const, p: 'lcs' }, { t: 'countdown' as const, p: 'lck' }, { t: 'czsk' as const }];

  it('sousední dlaždice se starty se spojí do jedné desky', () => {
    const nodes = renderDashboard(tiles, data());
    const strips = find(nodes, hasClass('strip'));
    expect(strips).toHaveLength(1);
    expect(cardLeagues(strips)).toEqual(['lec', 'lcs', 'lck']);
    expect(nodes.map((n) => n.attrs['data-tile'])).toEqual([0, 3]);
  });

  it('při úpravách zůstávají zvlášť, aby šla každá posunout a odebrat', () => {
    const nodes = renderDashboard(tiles, data(), { separate: true });
    expect(find(nodes, hasClass('strip'))).toHaveLength(3);
    expect(nodes.map((n) => n.attrs['data-tile'])).toEqual([0, 1, 2, 3]);
  });

  it('dlaždice bez ligy ukáže všechny ligy', () => {
    const nodes = renderDashboard([{ t: 'countdown' }], data());
    expect(find(nodes, hasClass('cd-group')).length).toBeGreaterThan(1);
  });

  it('konfigurace: starty lig jdou uložit s ligou i bez ní', () => {
    const catalog: Catalog = { leagues: [{ id: 'lec', label: 'LEC' }], teams: [], players: [], tournaments: [] };
    const res = validateConfig({ v: 1, tiles: [{ t: 'countdown' }, { t: 'countdown', p: 'lec' }, { t: 'countdown', p: 'neexistuje' }] }, catalog);
    expect(res.config.tiles).toEqual([{ t: 'countdown' }, { t: 'countdown', p: 'lec' }]);
    expect(res.dropped).toBe(1);
  });
});
