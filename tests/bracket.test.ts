// Pavouk play-off: vyřazovací (Worlds, First Stand) a na dvě prohry (MSI). Lolesports neříká, do kterého kola
// zápas patří, a pořadí zápasů se mezi ročníky liší; kola se proto odvozují z výsledků.
import { describe, expect, it } from 'vitest';
import { toDoubleElimination, toRounds } from '../pipeline/sources/lolesports';
import type { Match } from '../shared/types';

let seq = 0;
function played(winner: string, loser: string, startTime = ''): Match {
  return {
    id: String(++seq),
    league: 'msi',
    startTime,
    state: 'completed',
    bestOf: 5,
    teams: [
      { code: winner, name: winner, gameWins: 3, outcome: 'win' },
      { code: loser, name: loser, gameWins: 1, outcome: 'loss' },
    ],
  };
}
function planned(a: string, b: string): Match {
  return { id: String(++seq), league: 'msi', startTime: '', state: 'unstarted', bestOf: 5, teams: [{ code: a, name: a }, { code: b, name: b }] };
}
const shape = (rounds: ReturnType<typeof toRounds>) => rounds.map((r) => `${r.part ?? '-'}/${r.name}/${r.matches.map((m) => m.teams.map((t) => t.code).join('-')).join(',')}`);

// MSI 2026 v pořadí, v jakém zápasy vrací lolesports (2024–2026): H1 ×4, H2 ×2, D1 ×2, finále horního, D2 ×2, D3, finále dolního, velké finále
const MSI_2026 = () => [
  played('BLG', 'T1'), played('LYON', 'FUR'), played('HLE', 'TSW'), played('G2', 'TES'),
  played('BLG', 'LYON'), played('HLE', 'G2'),
  played('T1', 'FUR'), played('TSW', 'TES'),
  played('BLG', 'HLE'),
  played('G2', 'T1'), played('LYON', 'TSW'),
  played('LYON', 'G2'),
  played('HLE', 'LYON'),
  played('HLE', 'BLG'),
];
const MSI_SHAPE = [
  'upper/1. kolo/BLG-T1,LYON-FUR,HLE-TSW,G2-TES',
  'upper/2. kolo/BLG-LYON,HLE-G2',
  'upper/Finále/BLG-HLE',
  'lower/1. kolo/T1-FUR,TSW-TES',
  'lower/2. kolo/G2-T1,LYON-TSW',
  'lower/3. kolo/LYON-G2',
  'lower/Finále/HLE-LYON',
  'final/Velké finále/HLE-BLG',
];

describe('pavouk na dvě prohry', () => {
  it('MSI: 14 zápasů rozdělí na horní pavouk, dolní pavouk a velké finále', () => {
    expect(shape(toRounds(MSI_2026()))).toEqual(MSI_SHAPE);
  });

  it('nezáleží na pořadí, ve kterém zdroj zápasy vrací (ročník 2023 měl finále horního pavouka až za 2. kolem dolního)', () => {
    const m = MSI_2026();
    const reordered = [...m.slice(0, 8), m[9], m[10], m[8], ...m.slice(11)];
    expect(shape(toRounds(reordered))).toEqual(MSI_SHAPE);
  });

  it('když jsou známé časy, řídí se jimi a ne pořadím ze zdroje', () => {
    const m = MSI_2026();
    m.forEach((x, i) => (x.startTime = `2026-07-${String(10 + i).padStart(2, '0')}T08:00:00Z`));
    const shuffled = [m[13], m[5], m[0], m[12], m[2], m[8], m[1], m[7], m[3], m[11], m[4], m[10], m[6], m[9]];
    const rounds = toRounds(shuffled);
    expect(rounds.map((r) => `${r.part}/${r.name}/${r.matches.length}`)).toEqual(['upper/1. kolo/4', 'upper/2. kolo/2', 'upper/Finále/1', 'lower/1. kolo/2', 'lower/2. kolo/2', 'lower/3. kolo/1', 'lower/Finále/1', 'final/Velké finále/1']);
    expect(rounds.at(-1)!.matches[0].teams.map((t) => t.code)).toEqual(['HLE', 'BLG']);
  });

  it('rozehraný turnaj: neznámé zápasy zaplní zbylá místa', () => {
    const m = [
      played('BLG', 'T1'), played('LYON', 'FUR'), played('HLE', 'TSW'), played('G2', 'TES'),
      planned('BLG', 'LYON'), planned('HLE', 'G2'),
      planned('T1', 'FUR'), planned('TSW', 'TES'),
      planned('TBD', 'TBD'), planned('TBD', 'TBD'), planned('TBD', 'TBD'), planned('TBD', 'TBD'), planned('TBD', 'TBD'), planned('TBD', 'TBD'),
    ];
    expect(toRounds(m).map((r) => `${r.part}/${r.name}/${r.matches.length}`)).toEqual([
      'upper/1. kolo/4', 'upper/2. kolo/2', 'upper/Finále/1', 'lower/1. kolo/2', 'lower/2. kolo/2', 'lower/3. kolo/1', 'lower/Finále/1', 'final/Velké finále/1',
    ]);
  });

  it('čtyři týmy: 6 zápasů', () => {
    const m = [played('A', 'B'), played('C', 'D'), played('A', 'C'), played('B', 'D'), played('C', 'B'), played('A', 'C')];
    expect(shape(toRounds(m))).toEqual(['upper/1. kolo/A-B,C-D', 'upper/Finále/A-C', 'lower/1. kolo/B-D', 'lower/Finále/C-B', 'final/Velké finále/A-C']);
  });

  it('zápasy, které formátu neodpovídají, zůstanou jako jedno kolo', () => {
    // tým se dvěma prohrami hraje dál: to není play-off na dvě prohry
    const m = [played('A', 'B'), played('C', 'D'), played('A', 'B'), played('A', 'B'), played('C', 'D'), played('A', 'C')];
    expect(toDoubleElimination(m)).toBeNull();
    expect(toRounds(m).map((r) => r.name)).toEqual(['Zápasy']);
    expect(toRounds([played('A', 'B'), played('C', 'D')]).map((r) => r.name)).toEqual(['Zápasy']);
  });
});

describe('vyřazovací pavouk', () => {
  it('7 zápasů = čtvrtfinále, semifinále, finále; bez částí', () => {
    const m = [played('A', 'B'), played('C', 'D'), played('E', 'F'), played('G', 'H'), played('A', 'C'), played('E', 'G'), played('A', 'E')];
    const rounds = toRounds(m);
    expect(rounds.map((r) => `${r.name}/${r.matches.length}`)).toEqual(['Čtvrtfinále/4', 'Semifinále/2', 'Finále/1']);
    expect(rounds.every((r) => r.part === undefined)).toBe(true);
  });
});
