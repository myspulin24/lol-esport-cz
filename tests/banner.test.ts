// Mezinárodní turnaje na dashboardu: jedna široká dlaždice s přepínačem turnajů a vítězem.
import { describe, expect, it } from 'vitest';
import { activeBracket, bracketChampion, renderDashboard, type RenderData } from '../shared/render';
import { validateConfig } from '../shared/dashboard-schema';
import type { Bracket, Catalog, Match } from '../shared/types';
import type { Child, VNode } from '../shared/vnode';

const NOW = new Date('2026-11-15T19:00:00Z');
let seq = 0;
function match(winner: string, loser: string, startTime: string, state: Match['state'] = 'completed'): Match {
  const done = state === 'completed';
  return {
    id: String(++seq),
    league: 'x',
    startTime,
    state,
    bestOf: 5,
    teams: [
      { code: winner, name: `Tým ${winner}`, slug: winner.toLowerCase(), gameWins: done ? 3 : undefined, outcome: done ? 'win' : undefined },
      { code: loser, name: `Tým ${loser}`, slug: loser.toLowerCase(), gameWins: done ? 1 : undefined, outcome: done ? 'loss' : undefined },
    ],
  };
}
const single = (tournament: string, name: string, day: string, finalState: Match['state'] = 'completed'): Bracket => ({
  tournament,
  league: tournament.split('_')[0],
  name,
  rounds: [
    { name: 'Semifinále', matches: [match('A', 'B', `${day}T10:00:00Z`), match('C', 'D', `${day}T14:00:00Z`)] },
    { name: 'Finále', matches: [match('A', 'C', `${day}T18:00:00Z`, finalState)] },
  ],
});

const BRACKETS = { first_stand_2026: single('first_stand_2026', 'First Stand 2026', '2026-03-22'), msi_2026: single('msi_2026', 'MSI 2026', '2026-07-12'), worlds_2026: single('worlds_2026', 'Worlds 2026', '2026-11-14') };
const CATALOG: Catalog = { leagues: [], teams: [], players: [], tournaments: Object.values(BRACKETS).map((b) => ({ id: b.tournament, label: b.name })) };
const data = (brackets: Record<string, Bracket> = BRACKETS): RenderData => ({ now: NOW, leagues: [], catalog: CATALOG, schedule: {}, standings: {}, teams: {}, brackets, streamers: {} });

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
const tabs = (nodes: Child[]) => find(nodes, (n) => n.attrs['data-action'] === 'bracket-tab');
const panes = (nodes: Child[]) => find(nodes, (n) => typeof n.attrs['data-bpane'] === 'string');
const shown = (nodes: Child[]) => panes(nodes).filter((p) => !p.attrs.hidden).map((p) => p.attrs['data-bpane']);

const THREE = [{ t: 'bracket' as const, p: 'first_stand_2026' }, { t: 'bracket' as const, p: 'msi_2026' }, { t: 'bracket' as const, p: 'worlds_2026' }, { t: 'czsk' as const }];

describe('mezinárodní turnaje na dashboardu', () => {
  it('sousední pavouci jsou jedna široká dlaždice s přepínačem; vidět je turnaj, kde se hrálo naposledy', () => {
    const nodes = renderDashboard(THREE, data());
    const wide = find(nodes, hasClass('tile--bracket'));
    expect(wide).toHaveLength(1);
    expect(String(wide[0].attrs.class)).toContain('tile--wide');
    expect(tabs(nodes).map((t) => `${t.attrs['data-tab']}:${t.attrs['aria-selected']}`)).toEqual(['first_stand_2026:false', 'msi_2026:false', 'worlds_2026:true']);
    expect(panes(nodes)).toHaveLength(3);
    expect(shown(nodes)).toEqual(['worlds_2026']);
    expect(nodes.map((n) => n.attrs['data-tile'])).toEqual([0, 3]);
  });

  it('rozehraný turnaj má přednost před naposledy odehraným', () => {
    const live = { ...BRACKETS, msi_2026: single('msi_2026', 'MSI 2026', '2026-07-12', 'unstarted') };
    expect(shown(renderDashboard(THREE, data(live)))).toEqual(['msi_2026']);
    expect(activeBracket(Object.values(live))?.tournament).toBe('msi_2026');
  });

  it('při úpravách zůstává každý pavouk zvlášť (jde posunout a odebrat) a přepínač nemá', () => {
    const nodes = renderDashboard(THREE, data(), { separate: true });
    expect(find(nodes, hasClass('tile--bracket'))).toHaveLength(3);
    expect(tabs(nodes)).toHaveLength(0);
    expect(nodes.map((n) => n.attrs['data-tile'])).toEqual([0, 1, 2, 3]);
  });

  it('dlaždice bez turnaje ukáže všechny turnaje z katalogu', () => {
    const nodes = renderDashboard([{ t: 'bracket' }], data());
    expect(tabs(nodes).map((t) => t.attrs['data-tab'])).toEqual(['first_stand_2026', 'msi_2026', 'worlds_2026']);
  });

  it('jediný turnaj: široká dlaždice bez přepínače, turnaj je v nadpisu', () => {
    const nodes = renderDashboard([{ t: 'bracket', p: 'msi_2026' }], data());
    expect(tabs(nodes)).toHaveLength(0);
    expect(find(nodes, (n) => n.tag === 'h2')[0].children.join('')).toBe('Pavouk · MSI 2026');
    expect(shown(nodes)).toEqual(['msi_2026']);
  });

  it('turnaj, který v datech není, se v přepínači neobjeví', () => {
    const nodes = renderDashboard([{ t: 'bracket', p: 'msi_2026' }, { t: 'bracket', p: 'neni_v_datech' }], data());
    expect(panes(nodes).map((p) => p.attrs['data-bpane'])).toEqual(['msi_2026']);
  });

  it('konfigurace: pavouk jde uložit s turnajem i bez něj', () => {
    const res = validateConfig({ v: 1, tiles: [{ t: 'bracket' }, { t: 'bracket', p: 'msi_2026' }, { t: 'bracket', p: 'neexistuje' }] }, CATALOG);
    expect(res.config.tiles).toEqual([{ t: 'bracket' }, { t: 'bracket', p: 'msi_2026' }]);
    expect(res.dropped).toBe(1);
  });
});

describe('vítěz turnaje', () => {
  it('je to vítěz finále; dokud se finále nehrálo, vítěz není', () => {
    expect(bracketChampion(BRACKETS.worlds_2026)?.code).toBe('A');
    expect(bracketChampion(single('x_2026', 'X', '2026-01-01', 'unstarted'))).toBeUndefined();
  });

  it('u play-off na dvě prohry rozhoduje velké finále, ne finále horního pavouka', () => {
    const b: Bracket = {
      tournament: 'msi_2026',
      league: 'msi',
      name: 'MSI 2026',
      rounds: [
        { name: 'Finále', part: 'upper', matches: [match('BLG', 'HLE', '2026-07-09T08:00:00Z')] },
        { name: 'Finále', part: 'lower', matches: [match('HLE', 'LYON', '2026-07-11T08:00:00Z')] },
        { name: 'Velké finále', part: 'final', matches: [match('HLE', 'BLG', '2026-07-12T06:00:00Z')] },
      ],
    };
    expect(bracketChampion(b)?.code).toBe('HLE');
    expect(bracketChampion({ ...b, rounds: b.rounds.slice(0, 2) })).toBeUndefined();
  });

  it('karta vítěze je v pavouku a v režimu bez spoilerů se dá skrýt', () => {
    const nodes = renderDashboard([{ t: 'bracket', p: 'worlds_2026' }], data());
    const champ = find(nodes, hasClass('br-champ'));
    expect(champ).toHaveLength(1);
    expect(champ[0].attrs['data-spoiler']).toBe('1');
    expect(find(champ, hasClass('sp-name'))).toHaveLength(1);
    expect(find(champ, hasClass('br-champ-name'))[0].children.join('')).toBe('Tým A');
  });
});
