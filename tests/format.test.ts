import { describe, expect, it } from 'vitest';
import { daysUntil, formatAgo, formatDate, formatDuration, formatRelativeDay, formatTime, blockCs, pluralDays, roleCs, stageCs } from '../shared/format';

const NOW = new Date('2026-11-15T10:00:00Z');

describe('pražský čas', () => {
  it('zimní i letní čas', () => {
    expect(formatTime('2026-11-14T19:00:00Z')).toBe('20:00'); // SEČ = UTC+1
    expect(formatTime('2026-07-01T16:00:00Z')).toBe('18:00'); // SELČ = UTC+2
  });
  it('datum s českým dnem v týdnu', () => {
    expect(formatDate('2026-01-15T12:00:00Z')).toBe('čt 15. 1.');
    expect(formatDate('2026-11-14T19:00:00Z')).toBe('so 14. 11.');
  });
  it('dnes / zítra / včera podle pražské půlnoci, ne UTC', () => {
    expect(formatRelativeDay('2026-11-14T19:00:00Z', NOW)).toBe('včera');
    expect(formatRelativeDay('2026-11-15T22:30:00Z', NOW)).toBe('dnes'); // 23:30 v Praze
    expect(formatRelativeDay('2026-11-15T23:30:00Z', NOW)).toBe('zítra'); // 0:30 v Praze
    expect(formatRelativeDay('2026-11-20T12:00:00Z', NOW)).toBe('pá 20. 11.');
  });
  it('dny do data', () => {
    expect(daysUntil('2026-11-20', NOW)).toBe(5);
    expect(daysUntil('2026-11-15', NOW)).toBe(0);
  });
});

describe('drobné formáty', () => {
  it('délka hry', () => {
    expect(formatDuration(1872)).toBe('31:12');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(undefined)).toBe('');
  });
  it('stáří dat', () => {
    expect(formatAgo(undefined, NOW)).toBe('neznámo');
    expect(formatAgo('2026-11-15T09:59:40Z', NOW)).toBe('právě teď');
    expect(formatAgo('2026-11-15T09:48:00Z', NOW)).toBe('před 12 min');
    expect(formatAgo('2026-11-15T07:00:00Z', NOW)).toBe('před 3 h');
    expect(formatAgo('2026-11-12T10:00:00Z', NOW)).toBe('před 3 dny');
  });
  it('skloňování dnů a české role', () => {
    expect([1, 3, 5].map(pluralDays)).toEqual(['1 den', '3 dny', '5 dní']);
    expect(roleCs('bottom')).toBe('ADC');
    expect(roleCs('JUNGLE')).toBe('Jungle');
    expect(roleCs('Strategic Coach')).toBe('Strategic Coach');
    expect(roleCs(undefined)).toBe('');
  });
});

describe('blockCs', () => {
  it('přeloží bloky rozpisu', () => {
    expect(blockCs('Finals')).toBe('Finále');
    expect(blockCs('Semifinals')).toBe('Semifinále');
    expect(blockCs('Quarterfinals')).toBe('Čtvrtfinále');
    expect(blockCs('Week 3')).toBe('3. týden');
    expect(blockCs('Round 2')).toBe('2. kolo');
    expect(blockCs('Playoffs')).toBe('Play-off');
    expect(blockCs('Něco jiného')).toBe('Něco jiného');
    expect(blockCs(undefined)).toBe('');
  });
});

describe('stageCs', () => {
  it('přeloží běžné fáze, neznámé nechá', () => {
    expect(stageCs('Regular Season')).toBe('Základní část');
    expect(stageCs('Playoffs')).toBe('Play-off');
    expect(stageCs('Swiss Stage')).toBe('Švýcarský systém');
    expect(stageCs('Finals Weekend')).toBe('Finals Weekend');
    expect(stageCs(undefined)).toBe('');
  });
});
