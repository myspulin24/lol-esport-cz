import { describe, expect, it } from 'vitest';
import { estimatedSeriesMinutes, isInSeason, matchStatus, seasonSwitch } from '../shared/season';
import type { Match } from '../shared/types';

const NOW = new Date('2026-11-15T10:00:00Z');
const H = 3_600_000;

const match = (o: Partial<Match> = {}): Match => ({
  id: 'm1',
  league: 'lec',
  startTime: NOW.toISOString(),
  state: 'unstarted',
  bestOf: 3,
  teams: [
    { code: 'G2', name: 'G2 Esports' },
    { code: 'VIT', name: 'Team Vitality' },
  ],
  ...o,
});

describe('isInSeason', () => {
  it('zápas sezónní ligy do ±3 dnů = v sezóně', () => {
    expect(isInSeason([match({ startTime: new Date(NOW.getTime() + 2 * 24 * H).toISOString() })], NOW)).toBe(true);
    expect(isInSeason([match({ startTime: new Date(NOW.getTime() - 2 * 24 * H).toISOString() })], NOW)).toBe(true);
  });
  it('zápas za 4 dny nebo v nesezónní lize = mimo sezónu', () => {
    expect(isInSeason([match({ startTime: new Date(NOW.getTime() + 4 * 24 * H).toISOString() })], NOW)).toBe(false);
    expect(isInSeason([match({ league: 'hitpoint_masters' })], NOW)).toBe(false);
    expect(isInSeason([], NOW)).toBe(false);
  });
});

describe('seasonSwitch (D12)', () => {
  it('odpočet ligy, která právě hraje, se změní na „Dnes“ té ligy; ostatní dlaždice zůstanou', () => {
    const tiles = [{ t: 'countdown', p: 'lec' }, { t: 'countdown', p: 'lck' }, { t: 'czsk' }];
    const res = seasonSwitch(tiles, [match({ league: 'lec', startTime: new Date(NOW.getTime() + 24 * H).toISOString() })], NOW);
    expect(res.tiles).toEqual([{ t: 'today', p: 'lec' }, { t: 'countdown', p: 'lck' }, { t: 'czsk' }]);
    expect(res.leagues).toEqual(['lec']);
  });
  it('bez zápasů se nic nemění', () => {
    const tiles = [{ t: 'countdown', p: 'lec' }];
    expect(seasonSwitch(tiles, [], NOW)).toEqual({ tiles, leagues: [] });
  });
});

describe('matchStatus (D7)', () => {
  it('odehraný zápas ukazuje skóre', () => {
    const m = match({ state: 'completed', teams: [{ code: 'G2', name: 'G2', gameWins: 2 }, { code: 'VIT', name: 'VIT', gameWins: 1 }] });
    expect(matchStatus(m, NOW)).toEqual({ kind: 'final', label: '2 : 1' });
  });
  it('budoucí zápas: minuty, hodiny, pak „naplánováno“', () => {
    expect(matchStatus(match({ startTime: new Date(NOW.getTime() + 30 * 60_000).toISOString() }), NOW).label).toBe('za 30 min');
    expect(matchStatus(match({ startTime: new Date(NOW.getTime() + 5 * H).toISOString() }), NOW).label).toBe('za 5 h');
    expect(matchStatus(match({ startTime: new Date(NOW.getTime() + 30 * H).toISOString() }), NOW).label).toBe('naplánováno');
  });
  it('po začátku „probíhá“ po odhadovanou délku série, pak „čeká na výsledek“', () => {
    expect(matchStatus(match({ startTime: new Date(NOW.getTime() - 1 * H).toISOString() }), NOW).kind).toBe('live');
    expect(matchStatus(match({ startTime: new Date(NOW.getTime() - 3 * H).toISOString() }), NOW).kind).toBe('awaiting');
    expect(matchStatus(match({ state: 'inProgress', startTime: new Date(NOW.getTime() - 6 * H).toISOString() }), NOW).kind).toBe('live');
  });
  it('odhad délky série je 50 min na hru', () => {
    expect(estimatedSeriesMinutes(1)).toBe(50);
    expect(estimatedSeriesMinutes(5)).toBe(250);
    expect(estimatedSeriesMinutes(0)).toBe(50);
  });
});
