// Pravidlo sezóny (design doc + R2-1): „v sezóně“ = kterákoli soutěž určující sezónu
// (LCK, LPL, LEC, LCS, First Stand, MSI, Worlds) má zápas v rozmezí ±3 dny od dneška.
// Stav zápasu v řádku „Dnes“ (D7): za X h → probíhá → čeká na výsledek → skóre.

import type { Match } from './types';
import { SEASON_LEAGUES } from './leagues';

const DAY = 86_400_000;

export function isInSeason(matches: Match[], now: Date = new Date(), windowDays = 3): boolean {
  const lo = now.getTime() - windowDays * DAY;
  const hi = now.getTime() + windowDays * DAY;
  return matches.some((m) => {
    if (!SEASON_LEAGUES.includes(m.league)) return false;
    const t = new Date(m.startTime).getTime();
    return t >= lo && t <= hi;
  });
}

/**
 * D12: uložený dashboard při startu sezóny — dlaždice odpočtu ligy, která právě hraje (±3 dny),
 * se změní na „Dnes“ pro tutéž ligu. Vrací nové dlaždice a ligy, kterých se změna týkala.
 */
export function seasonSwitch<T extends { t: string; p?: string }>(tiles: T[], matches: Match[], now: Date = new Date()): { tiles: Array<T | { t: 'today'; p: string }>; leagues: string[] } {
  const playing = new Set<string>();
  for (const m of matches) {
    if (Math.abs(new Date(m.startTime).getTime() - now.getTime()) <= 3 * DAY) playing.add(m.league);
  }
  const leagues: string[] = [];
  const next = tiles.map((t) => {
    if (t.t === 'countdown' && t.p && playing.has(t.p)) {
      leagues.push(t.p);
      return { t: 'today' as const, p: t.p };
    }
    return t;
  });
  return { tiles: next, leagues };
}

/** Odhad délky série v minutách: ~50 min na hru (vč. pauz), Bo1=50, Bo3=150 (2–3 hry), Bo5=250. */
export function estimatedSeriesMinutes(bestOf: number): number {
  return Math.max(1, bestOf) * 50;
}

export type MatchStatus =
  | { kind: 'upcoming'; label: string }
  | { kind: 'live'; label: string }
  | { kind: 'awaiting'; label: string }
  | { kind: 'final'; label: string };

export function matchStatus(m: Match, now: Date = new Date()): MatchStatus {
  if (m.state === 'completed') {
    const a = m.teams[0].gameWins ?? 0;
    const b = m.teams[1].gameWins ?? 0;
    return { kind: 'final', label: `${a} : ${b}` };
  }
  const start = new Date(m.startTime).getTime();
  const nowMs = now.getTime();
  if (nowMs < start) {
    const min = Math.round((start - nowMs) / 60_000);
    if (min < 60) return { kind: 'upcoming', label: `za ${Math.max(1, min)} min` };
    const h = Math.round(min / 60);
    if (h < 24) return { kind: 'upcoming', label: `za ${h} h` };
    return { kind: 'upcoming', label: 'naplánováno' };
  }
  if (m.state === 'inProgress' || nowMs < start + estimatedSeriesMinutes(m.bestOf) * 60_000) {
    return { kind: 'live', label: 'probíhá' };
  }
  return { kind: 'awaiting', label: 'čeká na výsledek' };
}
