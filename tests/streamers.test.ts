import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { loadStreamers, validateStreamers } from '../pipeline/streamers';

describe('config/streameri.yaml', () => {
  it('prázdný soubor nebo prázdné seznamy jsou v pořádku', () => {
    expect(validateStreamers(null)).toEqual({});
    expect(validateStreamers({ lec: null, lck: [] })).toEqual({ lck: [] });
  });

  it('platný záznam projde a ořízne mezery', () => {
    expect(validateStreamers({ lec: [{ name: '  Testovací kanál ', url: 'https://example.com/kanal' }] })).toEqual({
      lec: [{ name: 'Testovací kanál', url: 'https://example.com/kanal' }],
    });
  });

  it('překlep v klíči ligy zastaví build (nesmí tiše schovat odkazy)', () => {
    expect(() => validateStreamers({ lecc: [] })).toThrow(/neznámý klíč ligy „lecc“/);
  });

  it('chybějící jméno nebo nebezpečný odkaz zastaví build', () => {
    expect(() => validateStreamers({ lec: [{ name: 'X', url: 'javascript:alert(1)' }] })).toThrow(/http\(s\) url/);
    expect(() => validateStreamers({ lec: [{ url: 'https://example.com' }] })).toThrow(/name/);
    expect(() => validateStreamers({ lec: 'kanál' })).toThrow(/seznam/);
    expect(() => validateStreamers(['lec'])).toThrow(/kořen/);
  });

  it('soubor v repozitáři je platný', async () => {
    const res = await loadStreamers(join(import.meta.dirname, '..', 'config', 'streameri.yaml'));
    expect(typeof res).toBe('object');
  });
});
