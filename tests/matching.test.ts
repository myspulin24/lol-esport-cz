import { describe, expect, it } from 'vitest';
import { teamKey } from '../shared/team-key';
import { tournamentName } from '../shared/leagues';
import { attachGames } from '../pipeline/run';
import type { Match } from '../shared/types';
import type { GameRow } from '../pipeline/sources/leaguepedia';

describe('teamKey: stejný tým z lolesports a Leaguepedie', () => {
  it('sjednotí běžné varianty názvu', () => {
    expect(teamKey('Gen.G Esports')).toBe(teamKey('Gen.G'));
    expect(teamKey('Team Vitality')).toBe(teamKey('Vitality'));
    expect(teamKey('BILIBILI GAMING')).toBe(teamKey('Bilibili Gaming'));
    expect(teamKey('Movistar KOI')).toBe(teamKey('Movistar KOI'));
  });
  it('akademie a jiné týmy zůstanou odlišené', () => {
    expect(teamKey('T1')).not.toBe(teamKey('T1 Esports Academy'));
    expect(teamKey('Karmine Corp')).not.toBe(teamKey('Karmine Corp Blue'));
  });
  it('název jen ze stop slov se nezahodí', () => {
    expect(teamKey('Team Gaming')).toBe('teamgaming');
    expect(teamKey(undefined)).toBe('');
  });
});

describe('tournamentName', () => {
  it('udělá z interního slugu čitelný název', () => {
    expect(tournamentName('LEC', 'lec_split_3_2026')).toBe('LEC 2026 Split 3');
    expect(tournamentName('Worlds', 'worlds_2026')).toBe('Worlds 2026');
    expect(tournamentName('Hitpoint Masters', 'hitpoint_masters_split_3_2026')).toBe('Hitpoint Masters 2026 Split 3');
    expect(tournamentName('LCK', 'lck_spring_2026')).toBe('LCK 2026 jaro');
  });
});

describe('attachGames: hry z Leaguepedie k zápasům lolesports', () => {
  const base = (): Match => ({
    id: 'final',
    league: 'worlds',
    startTime: '2026-11-14T19:00:00.000Z',
    state: 'completed',
    bestOf: 5,
    teams: [
      { code: 'GEN', name: 'Gen.G Esports', gameWins: 1 },
      { code: 'BLG', name: 'Bilibili Gaming', gameWins: 3 },
    ],
  });
  const game = (n: number, win: string, at: string): GameRow => ({
    team1: 'Gen.G',
    team2: 'Bilibili Gaming',
    winTeam: win,
    durationSec: 1800 + n,
    dateTimeUtc: at,
    n,
    matchId: 'x',
  });

  it('spáruje hry podle dvojice týmů a času a přeloží vítěze na kód týmu', () => {
    const m = base();
    attachGames(
      [m],
      [
        game(2, 'Bilibili Gaming', '2026-11-14T20:00:00Z'),
        game(1, 'Gen.G', '2026-11-14T19:10:00Z'),
        game(3, 'Bilibili Gaming', '2026-11-14T21:00:00Z'),
        game(4, 'Bilibili Gaming', '2026-11-14T22:00:00Z'),
        game(1, 'Gen.G', '2026-11-10T19:00:00Z'), // jiný den, jiný zápas
      ],
    );
    expect(m.games).toEqual([
      { n: 1, winnerCode: 'GEN', durationSec: 1801 },
      { n: 2, winnerCode: 'BLG', durationSec: 1802 },
      { n: 3, winnerCode: 'BLG', durationSec: 1803 },
      { n: 4, winnerCode: 'BLG', durationSec: 1804 },
    ]);
  });

  it('vrátí podrobnosti her pro stránku zápasu: strany, sestavy, zákazy, statistiky', () => {
    const m = base();
    const side = (kills: number, picks: string[]) => ({ kills, gold: 60000 + kills, picks, bans: ['Jayce'], players: ['A', 'B', 'C', 'D', 'E'] });
    const details = attachGames(
      [m],
      [
        { ...game(1, 'Gen.G', '2026-11-14T19:10:00Z'), patch: '26.20', vod: 'https://example.com/v', sides: [side(19, ['Olaf']), side(4, ['Gnar'])] },
        // ve druhé hře si týmy prohodí strany: modrá je Bilibili
        { ...game(2, 'Bilibili Gaming', '2026-11-14T20:00:00Z'), team1: 'Bilibili Gaming', team2: 'Gen.G', sides: [side(20, ['Jax']), side(8, ['Vi'])] },
      ],
    );
    const games = details.get('final')!;
    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({ n: 1, winnerCode: 'GEN', patch: '26.20', vod: 'https://example.com/v', blue: { code: 'GEN', kills: 19, picks: ['Olaf'] }, red: { code: 'BLG', kills: 4 } });
    expect(games[1]).toMatchObject({ n: 2, winnerCode: 'BLG', blue: { code: 'BLG', kills: 20 }, red: { code: 'GEN', kills: 8 } });
  });

  it('zápas bez podrobností her (starší řádky) v mapě není', () => {
    const m = base();
    expect(attachGames([m], [game(1, 'Gen.G', '2026-11-14T19:10:00Z')]).size).toBe(0);
    expect(m.games).toHaveLength(1);
  });

  it('neodehraný zápas ani cizí dvojice týmů hry nedostane', () => {
    const upcoming = { ...base(), state: 'unstarted' as const };
    const other = { ...base(), teams: [{ code: 'T1', name: 'T1' }, { code: 'KC', name: 'Karmine Corp' }] as Match['teams'] };
    attachGames([upcoming, other], [game(1, 'Gen.G', '2026-11-14T19:10:00Z')]);
    expect(upcoming.games).toBeUndefined();
    expect(other.games).toBeUndefined();
  });
});
