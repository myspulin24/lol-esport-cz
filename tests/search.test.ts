import { describe, expect, it } from 'vitest';
import { buildIndex, findHits, groupHits, normText, splitMatch } from '../shared/search';
import type { Catalog } from '../shared/types';

const catalog: Catalog = {
  leagues: [{ id: 'lec', label: 'LEC', group: 'Evropa' }],
  teams: [
    { id: 'g2-esports', label: 'G2 Esports (G2)', group: 'LEC', league: 'lec', code: 'G2', image: 'https://example.com/g2.png' },
    { id: 'team-vitality', label: 'Team Vitality (VIT)', group: 'LEC', league: 'lec', code: 'VIT' },
  ],
  players: [
    { id: 'caps', label: 'Caps', group: 'G2', league: 'lec', team: 'g2-esports', country: 'DK' },
    { id: 'brokenblade', label: 'BrokenBlade', group: 'G2', league: 'lec', team: 'g2-esports' },
    { id: 'carzzy', label: 'Carzzy', group: 'VIT', league: 'lec', team: 'team-vitality', country: 'CZ' },
  ],
  tournaments: [{ id: 'worlds_2026', label: 'Worlds 2026', league: 'worlds' }],
};
const index = buildIndex(catalog);
const labels = (q: string, limit?: number) => findHits(index, q, limit).map((h) => `${h.kind}:${h.label}`);

describe('hledání v katalogu', () => {
  it('kód týmu najde tým a pod ním jeho hráče', () => {
    expect(labels('g2')).toEqual(['team:G2 Esports', 'player:BrokenBlade', 'player:Caps']);
    expect(findHits(index, 'g2')[0]).toMatchObject({ href: '/tym/g2-esports/', sub: 'G2 · LEC', image: 'https://example.com/g2.png' });
  });
  it('přezdívka hráče: začátek slova, bez ohledu na velikost písmen', () => {
    expect(labels('ca')).toEqual(['player:Caps', 'player:Carzzy']);
    expect(labels('CARZ')).toEqual(['player:Carzzy']);
    expect(findHits(index, 'carzzy')[0]).toMatchObject({ href: '/hrac/carzzy/', sub: 'VIT · LEC', country: 'CZ' });
  });
  it('shoda uprostřed názvu je až za shodou na začátku', () => {
    expect(labels('vit')).toEqual(['team:Team Vitality', 'player:Carzzy']);
    expect(labels('blade')).toEqual(['player:BrokenBlade']);
  });
  it('ligy a turnaje', () => {
    expect(labels('lec')[0]).toBe('league:LEC');
    expect(findHits(index, 'world')[0]).toMatchObject({ kind: 'tournament', href: '/turnaj/worlds_2026/' });
  });
  it('nic nenalezeno, prázdný dotaz a limit', () => {
    expect(labels('xyz')).toEqual([]);
    expect(labels('   ')).toEqual([]);
    expect(labels('g2', 2)).toHaveLength(2);
  });
  it('skupiny jdou v pořadí nejlepší shody', () => {
    expect(groupHits(findHits(index, 'g2')).map((g) => [g.kind, g.hits.length])).toEqual([
      ['team', 1],
      ['player', 2],
    ]);
  });
});

describe('zvýraznění shody', () => {
  it('rozdělí popisek na část před, shodu a zbytek', () => {
    expect(splitMatch('G2 Esports', 'g2')).toEqual(['', 'G2', ' Esports']);
    expect(splitMatch('BrokenBlade', 'blade')).toEqual(['Broken', 'Blade', '']);
    expect(splitMatch('Čeští', 'ces')).toEqual(['', 'Češ', 'tí']);
    expect(splitMatch('Caps', 'xyz')).toEqual(['Caps', '', '']);
  });
  it('normText odstraní diakritiku a velikost písmen', () => {
    expect(normText('  ŽLUŤOUČKÝ kůň ')).toBe('zlutoucky kun');
  });
});
