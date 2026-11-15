import { describe, expect, it } from 'vitest';
import { countryCode, resolveCountry, staleIds, type PlayerCountryCache } from '../pipeline/countries';
import { countryName, flagSrc, isCountryCode } from '../shared/countries';

describe('countryCode: název státu z Leaguepedie → kód', () => {
  it('běžné názvy a varianty, které Leaguepedia píše jinak', () => {
    expect(countryCode('South Korea')).toBe('KR');
    expect(countryCode('China')).toBe('CN');
    expect(countryCode('Czech Republic')).toBe('CZ');
    expect(countryCode('Czechia')).toBe('CZ');
    expect(countryCode('Slovakia')).toBe('SK');
    expect(countryCode('Turkey')).toBe('TR');
    expect(countryCode('Türkiye')).toBe('TR');
    expect(countryCode('United States')).toBe('US');
    expect(countryCode('Bosnia and Herzegovina')).toBe('BA');
    expect(countryCode('England')).toBe('GB-ENG');
    expect(countryCode('Kosovo')).toBe('XK');
    expect(countryCode('Denmark')).toBe('DK');
  });
  it('neznámý nebo prázdný název = žádná vlajka', () => {
    expect(countryCode('Summoner’s Rift')).toBeUndefined();
    expect(countryCode('')).toBeUndefined();
    expect(countryCode(undefined)).toBeUndefined();
  });
});

describe('resolveCountry: jmenovci se rozliší týmem', () => {
  const cache: PlayerCountryCache = {
    caps: { at: '2026-11-15T00:00:00Z', rows: [{ country: 'AT', team: '', retired: true }, { country: 'DK', team: 'G2 Esports', retired: false }] },
    zest: {
      at: '2026-11-15T00:00:00Z',
      rows: [{ country: 'IT', team: '', retired: false }, { country: 'KR', team: '', retired: true }, { country: 'KR', team: 'LØS', retired: false }],
    },
    faker: { at: '2026-11-15T00:00:00Z', rows: [{ country: 'KR', team: 'T1', retired: false }] },
    nobody: { at: '2026-11-15T00:00:00Z', rows: [] },
  };
  it('jediný hráč nebo jediný stát mezi jmenovci', () => {
    expect(resolveCountry('Faker', 'T1', cache)).toBe('KR');
    expect(resolveCountry('FAKER', undefined, cache)).toBe('KR');
  });
  it('víc států: rozhodne tým (i když se název týmu mezi zdroji liší)', () => {
    expect(resolveCountry('Caps', 'G2', cache)).toBe('DK');
    expect(resolveCountry('Zest', 'LØS', cache)).toBe('KR');
  });
  it('bez shody týmu rozhodne jediný aktivní hráč; jinak raději nic', () => {
    expect(resolveCountry('Caps', 'Jiný tým', cache)).toBe('DK');
    expect(resolveCountry('Zest', 'Jiný tým', cache)).toBeUndefined();
    expect(resolveCountry('Nobody', 'T1', cache)).toBeUndefined();
    expect(resolveCountry('Neznamy', 'T1', cache)).toBeUndefined();
  });
});

describe('staleIds: Leaguepedie se ptáme jen na to, co nevíme', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const cache: PlayerCountryCache = {
    faker: { at: '2026-11-10T00:00:00Z', rows: [{ country: 'KR', team: 'T1', retired: false }] },
    stary: { at: '2026-09-01T00:00:00Z', rows: [{ country: 'KR', team: 'T1', retired: false }] },
    prazdny: { at: '2026-11-14T00:00:00Z', rows: [] },
    prazdnystary: { at: '2026-11-10T00:00:00Z', rows: [] },
  };
  it('nové přezdívky, prázdné výsledky po 3 dnech, známé po 30 dnech', () => {
    expect(staleIds(['Faker', 'Stary', 'Prazdny', 'PrazdnyStary', 'Novy', 'Novy'], cache, now)).toEqual(['Stary', 'PrazdnyStary', 'Novy']);
  });
});

describe('vlajky v prohlížeči', () => {
  it('český název státu a cesta k souboru', () => {
    expect(countryName('KR')).toBe('Jižní Korea');
    expect(countryName('CZ')).toBe('Česko');
    expect(countryName('GB-ENG')).toBe('Anglie');
    expect(flagSrc('GB-ENG')).toBe('/data/flags/gb-eng.svg');
  });
  it('kód státu se ověřuje (nesmí jít podstrčit cesta)', () => {
    expect(isCountryCode('KR')).toBe(true);
    expect(isCountryCode('GB-ENG')).toBe(true);
    expect(isCountryCode('../x')).toBe(false);
    expect(isCountryCode('kr')).toBe(false);
    expect(isCountryCode(undefined)).toBe(false);
  });
});
