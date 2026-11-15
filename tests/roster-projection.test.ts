import { describe, expect, it } from 'vitest';
import { movements, normalizeRole, projectRoster } from '../shared/roster-projection';
import type { Team, Transfer } from '../shared/types';

const team = (players: Array<[string, string]>): Team => ({
  slug: 'g2-esports',
  code: 'G2',
  name: 'G2 Esports',
  league: 'lec',
  players: players.map(([handle, role]) => ({ slug: handle.toLowerCase().replace(/\s+/g, '-'), handle, role, team: 'g2-esports' })),
});

const G2 = team([
  ['BrokenBlade', 'top'],
  ['SkewMond', 'jungle'],
  ['Caps', 'mid'],
  ['Hans Sama', 'bottom'],
  ['Labrov', 'support'],
]);

let n = 0;
const tr = (o: Partial<Transfer> & Pick<Transfer, 'player' | 'type' | 'status'>): Transfer => ({
  key: `k${n++}`,
  date: '2026-11-10',
  firstSeen: '2026-11-10T08:00:00.000Z',
  ...o,
});

const byRole = (p: ReturnType<typeof projectRoster>, role: string) => p.roles.find((r) => r.role === role)!;

describe('projectRoster: odhad soupisky na další split', () => {
  it('bez přestupů je odhad stejný jako dnešní soupiska', () => {
    const p = projectRoster(G2, []);
    expect(p.changed).toBe(false);
    expect(p.counts).toEqual({ set: 5, uncertain: 0, open: 0 });
    expect(p.roles.map((r) => r.players.map((x) => `${x.handle}:${x.status}`))).toEqual([['BrokenBlade:stays'], ['SkewMond:stays'], ['Caps:stays'], ['Hans Sama:stays'], ['Labrov:stays']]);
    expect(p.departures).toEqual([]);
  });

  it('potvrzený odchod uvolní pozici, potvrzený příchod ji obsadí', () => {
    const p = projectRoster(G2, [
      tr({ player: 'Hans Sama', type: 'leave', status: 'confirmed', from: 'G2 Esports', role: 'Bot', date: '2026-11-10' }),
      tr({ player: 'Jopa', type: 'move', status: 'confirmed', from: 'SK Gaming', to: 'G2', role: 'Bot', date: '2026-11-12', country: 'DE' }),
    ]);
    expect(byRole(p, 'bottom').players).toMatchObject([{ handle: 'Jopa', status: 'new', teams: ['SK Gaming'], country: 'DE' }]);
    expect(byRole(p, 'bottom').state).toBe('set');
    expect(p.departures).toMatchObject([{ handle: 'Hans Sama', role: 'bottom', to: undefined }]);
    expect(p.changed).toBe(true);
  });

  it('odchod bez náhrady nechá pozici volnou', () => {
    const p = projectRoster(G2, [tr({ player: 'Caps', type: 'retire', status: 'confirmed', from: 'G2 Esports', role: 'Mid' })]);
    expect(byRole(p, 'mid')).toMatchObject({ state: 'open', players: [] });
    expect(p.departures[0]).toMatchObject({ handle: 'Caps', retired: true });
    expect(p.counts).toEqual({ set: 4, uncertain: 0, open: 1 });
  });

  it('spekulace: hráč zůstává v odhadu s označením, cíle se sčítají; spekulovaný příchod je navíc', () => {
    const p = projectRoster(G2, [
      tr({ player: 'BrokenBlade', type: 'move', status: 'rumor', from: 'G2 Esports', to: 'Movistar KOI', role: 'Top' }),
      tr({ player: 'BrokenBlade', type: 'move', status: 'rumor', from: 'G2 Esports', to: 'Karmine Corp', role: 'Top', date: '2026-11-11' }),
      tr({ player: 'Naak Nako', type: 'move', status: 'rumor', from: 'Team Vitality', to: 'G2 Esports', role: 'Top', country: 'TR' }),
      tr({ player: 'Caps', type: 'move', status: 'withdrawn', from: 'G2 Esports', to: 'Fnatic' }), // stažená zpráva se nepočítá
    ]);
    expect(byRole(p, 'top').players).toMatchObject([
      { handle: 'BrokenBlade', status: 'rumor-out', teams: ['Movistar KOI', 'Karmine Corp'] },
      { handle: 'Naak Nako', status: 'rumor-in', teams: ['Team Vitality'] },
    ]);
    expect(byRole(p, 'top').state).toBe('uncertain');
    expect(byRole(p, 'mid').players[0].status).toBe('stays');
    expect(p.counts).toEqual({ set: 4, uncertain: 1, open: 0 });
  });

  it('poslední potvrzená událost rozhoduje (odchod a návrat) a spekulace u odešlého hráče jde k odchodu', () => {
    const p = projectRoster(G2, [
      tr({ player: 'Labrov', type: 'leave', status: 'confirmed', from: 'G2 Esports', role: 'Support', date: '2026-11-01' }),
      tr({ player: 'Labrov', type: 'join', status: 'confirmed', to: 'G2 Esports', role: 'Support', date: '2026-11-14' }),
      tr({ player: 'Hans Sama', type: 'leave', status: 'confirmed', from: 'G2 Esports', role: 'Bot', date: '2026-11-13' }),
      tr({ player: 'Hans Sama', type: 'move', status: 'rumor', from: 'G2 Esports', to: 'Team Heretics', role: 'Bot', date: '2026-11-14' }),
    ]);
    expect(byRole(p, 'support').players).toMatchObject([{ handle: 'Labrov', status: 'new' }]);
    expect(p.departures).toMatchObject([{ handle: 'Hans Sama', rumoredTo: ['Team Heretics'] }]);
    expect(byRole(p, 'bottom').state).toBe('open');
  });

  it('tým se páruje i přes jiný zápis názvu, akademie se nepočítá', () => {
    const p = projectRoster(G2, [
      tr({ player: 'Novy', type: 'join', status: 'confirmed', to: 'G2', role: 'Jungle' }),
      tr({ player: 'Junior', type: 'join', status: 'confirmed', to: 'G2 NORD', role: 'Jungle' }),
    ]);
    expect(byRole(p, 'jungle').players.map((x) => x.handle)).toEqual(['SkewMond', 'Novy']);
  });

  it('změna role hráče v týmu ho přesune na novou pozici', () => {
    const p = projectRoster(G2, [tr({ player: 'Caps', type: 'role', status: 'confirmed', from: 'G2 Esports', to: 'G2 Esports', role: 'Mid', roleTo: 'Top' })]);
    expect(byRole(p, 'top').players.map((x) => x.handle)).toEqual(['BrokenBlade', 'Caps']);
    expect(byRole(p, 'mid').state).toBe('open');
  });
});

describe('normalizeRole', () => {
  it('sjednotí zápis rolí z lolesports a Leaguepedie', () => {
    expect(['top', 'Jungle', 'MID', 'Bot', 'bottom', 'ADC', 'Support', 'Coach', undefined].map(normalizeRole)).toEqual(['top', 'jungle', 'mid', 'bottom', 'bottom', 'bottom', 'support', 'none', 'none']);
  });
});

describe('movements: přehled, kam hráči odcházejí a kdo přichází', () => {
  it('rozdělí pohyby na odchody a příchody, potvrzené před spekulacemi', () => {
    const p = projectRoster(G2, [
      tr({ player: 'Hans Sama', type: 'leave', status: 'confirmed', from: 'G2 Esports', role: 'Bot', date: '2026-11-10' }),
      tr({ player: 'Hans Sama', type: 'move', status: 'rumor', from: 'G2 Esports', to: 'Team Heretics', role: 'Bot', date: '2026-11-11' }),
      tr({ player: 'BrokenBlade', type: 'move', status: 'rumor', from: 'G2 Esports', to: 'Movistar KOI', role: 'Top' }),
      tr({ player: 'Jopa', type: 'move', status: 'confirmed', from: 'SK Gaming', to: 'G2 Esports', role: 'Bot', date: '2026-11-12' }),
      tr({ player: 'Naak Nako', type: 'move', status: 'rumor', from: 'Team Vitality', to: 'G2 Esports', role: 'Top' }),
    ]);
    const mv = movements(p);
    expect(mv.out).toMatchObject([
      { handle: 'Hans Sama', dir: 'out', certain: true, teams: [], rumoredTo: ['Team Heretics'], role: 'bottom' },
      { handle: 'BrokenBlade', dir: 'out', certain: false, teams: ['Movistar KOI'], role: 'top' },
    ]);
    expect(mv.in).toMatchObject([
      { handle: 'Jopa', dir: 'in', certain: true, teams: ['SK Gaming'], role: 'bottom' },
      { handle: 'Naak Nako', dir: 'in', certain: false, teams: ['Team Vitality'], role: 'top' },
    ]);
  });

  it('bez změn jsou oba seznamy prázdné', () => {
    expect(movements(projectRoster(G2, []))).toEqual({ out: [], in: [] });
  });
});
