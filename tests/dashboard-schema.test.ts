import { describe, expect, it } from 'vitest';
import { decodeConfig, encodeConfig, MAX_CONFIG_BYTES, MAX_TILES, validateConfig } from '../shared/dashboard-schema';
import type { Catalog } from '../shared/types';

const catalog: Catalog = {
  leagues: [
    { id: 'lec', label: 'LEC' },
    { id: 'lck', label: 'LCK' },
  ],
  teams: [{ id: 'team-vitality', label: 'Team Vitality (VIT)', league: 'lec' }],
  players: [{ id: 'carzzy', label: 'Carzzy', league: 'lec', team: 'team-vitality' }],
  tournaments: [{ id: 'worlds_2026', label: 'Worlds 2026', league: 'worlds' }],
};

describe('validateConfig', () => {
  it('platná konfigurace projde beze změny', () => {
    const cfg = {
      v: 1,
      tiles: [
        { t: 'today' },
        { t: 'today', p: 'lec' },
        { t: 'results', p: 'lck' },
        { t: 'roster', p: 'team-vitality' },
        { t: 'player', p: 'carzzy' },
        { t: 'bracket', p: 'worlds_2026' },
        { t: 'transfers', p: 'all' },
        { t: 'transfers', p: 'czsk' },
        { t: 'transfers', p: 'lec' },
        { t: 'czsk' },
        { t: 'countdown', p: 'lec' },
      ],
    };
    const res = validateConfig(cfg, catalog);
    expect(res).toEqual({ config: cfg, dropped: 0, invalid: false });
  });

  it('neznámý typ, neznámý tým a chybějící parametr se zahodí a spočítají', () => {
    const res = validateConfig(
      { v: 1, tiles: [{ t: 'today' }, { t: 'hacker' }, { t: 'roster', p: 'neexistuje' }, { t: 'standings' }, null, { t: 'transfers', p: 'xyz' }] },
      catalog,
    );
    expect(res.config.tiles).toEqual([{ t: 'today' }]);
    expect(res.dropped).toBe(5);
    expect(res.invalid).toBe(false);
  });

  it('jiná verze nebo nesmysl = neplatná konfigurace', () => {
    expect(validateConfig({ v: 2, tiles: [] }, catalog).invalid).toBe(true);
    expect(validateConfig('ahoj', catalog).invalid).toBe(true);
    expect(validateConfig(null, catalog).invalid).toBe(true);
    expect(validateConfig({ v: 1, tiles: 'x' }, catalog).invalid).toBe(true);
  });

  it(`víc než ${MAX_TILES} dlaždic se ořízne`, () => {
    const tiles = Array.from({ length: MAX_TILES + 4 }, () => ({ t: 'czsk' }));
    const res = validateConfig({ v: 1, tiles }, catalog);
    expect(res.config.tiles).toHaveLength(MAX_TILES);
    expect(res.dropped).toBe(4);
  });

  it('parametr nesmí být jiného typu než řetězec (žádné vkládání objektů)', () => {
    const res = validateConfig({ v: 1, tiles: [{ t: 'results', p: { toString: () => 'lec' } }, { t: 'today', p: 5 }] }, catalog);
    expect(res.config.tiles).toEqual([]);
    expect(res.dropped).toBe(2);
  });
});

describe('encodeConfig / decodeConfig', () => {
  it('kódování tam a zpět vrátí stejný objekt a je bezpečné do URL', () => {
    const cfg = { v: 1 as const, tiles: [{ t: 'today' as const, p: 'lec' }, { t: 'transfers' as const, p: 'czsk' }] };
    const enc = encodeConfig(cfg);
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeConfig(enc)).toEqual(cfg);
  });

  it('zvládne diakritiku (UTF-8)', () => {
    const cfg = { v: 1 as const, tiles: [{ t: 'today' as const, p: 'žluťoučký' }] };
    expect(decodeConfig(encodeConfig(cfg))).toEqual(cfg);
  });

  it('poškozený nebo příliš velký odkaz vrátí null', () => {
    expect(decodeConfig('')).toBeNull();
    expect(decodeConfig('%%%nejde')).toBeNull();
    expect(decodeConfig(encodeConfig({ v: 1, tiles: [] }).slice(0, 5))).toBeNull();
    const huge = encodeConfig({ v: 1, tiles: Array.from({ length: 200 }, () => ({ t: 'today' as const, p: 'x'.repeat(20) })) });
    expect(huge.length).toBeGreaterThan((MAX_CONFIG_BYTES * 4) / 3);
    expect(decodeConfig(huge)).toBeNull();
  });
});
