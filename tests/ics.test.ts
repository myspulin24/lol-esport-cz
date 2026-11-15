import { describe, expect, it } from 'vitest';
import { buildIcs, fold } from '../shared/ics';
import type { Match } from '../shared/types';

const final: Match = {
  id: '115565',
  league: 'worlds',
  startTime: '2026-11-14T19:00:00.000Z',
  state: 'completed',
  block: 'Finále',
  bestOf: 5,
  teams: [
    { code: 'GEN', name: 'Gen.G' },
    { code: 'BLG', name: 'Bilibili Gaming' },
  ],
};

describe('buildIcs', () => {
  it('golden: kalendář s jedním zápasem', () => {
    const ics = buildIcs('Worlds · LoL esport česky', [final], 'https://lol.godmike.cz', '2026-11-15T10:00:00.000Z');
    expect(ics).toBe(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//lol-esport-cz//CS',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:Worlds · LoL esport česky',
        'X-WR-TIMEZONE:Europe/Prague',
        'BEGIN:VEVENT',
        'UID:115565@lol-esport-cz',
        'DTSTAMP:20261115T100000Z',
        'DTSTART:20261114T190000Z',
        'DTEND:20261114T231000Z', // Bo5 = 250 min
        'SUMMARY:Worlds: GEN – BLG',
        'DESCRIPTION:Gen.G vs. Bilibili Gaming (Bo5) · Finále',
        'URL:https://lol.godmike.cz/vysledky/',
        'END:VEVENT',
        'END:VCALENDAR',
        '',
      ].join('\r\n'),
    );
  });

  it('escapuje čárky, středníky a nové řádky a řadí podle času', () => {
    const a = { ...final, id: 'b', startTime: '2026-11-16T10:00:00.000Z', teams: [{ code: 'A', name: 'Tým; s, čárkou' }, { code: 'B', name: 'Druhý\nřádek' }] as Match['teams'] };
    const b = { ...final, id: 'a', startTime: '2026-11-15T10:00:00.000Z' };
    const ics = buildIcs('Test', [a, b], 'https://lol.godmike.cz', '2026-11-15T10:00:00.000Z');
    expect(ics).toContain('DESCRIPTION:Tým\\; s\\, čárkou vs. Druhý\\nřádek (Bo5)');
    expect(ics.indexOf('UID:a@')).toBeLessThan(ics.indexOf('UID:b@'));
  });
});

describe('fold (RFC 5545: max 75 oktetů na řádek)', () => {
  it('dlouhý řádek s diakritikou: žádný fyzický řádek nepřesáhne 75 bajtů a rozbalení vrátí původní text', () => {
    const line = 'DESCRIPTION:' + 'Příliš žluťoučký kůň úpěl ďábelské ódy – '.repeat(6);
    const folded = fold(line);
    for (const physical of folded.split('\r\n')) expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
  it('krátký řádek se nemění', () => {
    expect(fold('SUMMARY:LEC: G2 – VIT')).toBe('SUMMARY:LEC: G2 – VIT');
  });
});
