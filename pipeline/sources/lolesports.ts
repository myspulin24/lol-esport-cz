// Zdroj: neoficiální „persisted gateway“ API webu lolesports.com (sdílený veřejný klíč).
// Převádí odpovědi na doménové typy (shared/types.ts) přímo tady, na hranici.

import type { Bracket, BracketRound, LeagueInfo, Match, MatchTeam, Player, Standings, Team } from '../../shared/types';
import { TRACKED_LEAGUES, tournamentName } from '../../shared/leagues';
import { imageUrl, plainText } from '../../shared/safe-url';
import { fetchJson, SOURCE_BUDGET_MS } from '../http';
import { slugify, ymd } from '../util';

const BASE = 'https://esports-api.lolesports.com/persisted/gw';
const API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z'; // veřejný klíč, který používá lolesports.com

export interface LolesportsData {
  leagues: LeagueInfo[];
  matches: Match[];
  standings: Standings[];
  teams: Team[];
  brackets: Bracket[];
  tournaments: Array<{ slug: string; league: string; name: string; startDate: string; endDate: string }>;
}

interface RawTeam {
  id?: string;
  slug?: string;
  name?: string;
  code?: string;
  image?: string;
  result?: { outcome?: string | null; gameWins?: number } | null;
  record?: { wins?: number; losses?: number } | null;
}

interface RawEvent {
  startTime: string;
  state: string;
  type: string;
  blockName?: string;
  league?: { slug?: string };
  match?: { id: string; teams: RawTeam[]; strategy?: { count?: number } };
}

interface RawTournament {
  id: string;
  slug: string;
  startDate: string;
  endDate: string;
}

export async function fetchLolesports(now: Date, fetchImpl?: typeof fetch): Promise<LolesportsData> {
  const deadline = Date.now() + SOURCE_BUDGET_MS;
  const gw = <T>(path: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ hl: 'en-US', ...params });
    return fetchJson<T>(`${BASE}/${path}?${qs}`, { headers: { 'x-api-key': API_KEY }, deadline, fetchImpl });
  };

  const leaguesRaw = await gw<{ data: { leagues: Array<{ id: string; slug: string; name: string; region: string; image?: string }> } }>('getLeagues');
  const byApiSlug = new Map(leaguesRaw.data.leagues.map((l) => [l.slug, l]));

  const leagues: LeagueInfo[] = [];
  const matches: Match[] = [];
  const standings: Standings[] = [];
  const brackets: Bracket[] = [];
  const tournaments: LolesportsData['tournaments'] = [];
  const today = ymd(now);

  for (const tracked of TRACKED_LEAGUES) {
    const raw = byApiSlug.get(tracked.slug);
    if (!raw) continue;

    const tRes = await gw<{ data: { leagues: Array<{ tournaments: RawTournament[] }> } }>('getTournamentsForLeague', { leagueId: raw.id });
    const tours = (tRes.data.leagues[0]?.tournaments ?? []).slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
    const started = tours.filter((t) => t.startDate <= today);
    const current = started[0];
    const upcoming = tours.filter((t) => t.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    for (const t of tours.slice(0, 4)) {
      tournaments.push({ slug: t.slug, league: tracked.slug, name: tournamentName(tracked.name, t.slug), startDate: t.startDate, endDate: t.endDate });
    }

    leagues.push({
      slug: tracked.slug,
      name: tracked.name,
      region: tracked.region,
      group: tracked.group,
      image: imageUrl(raw.image),
      currentTournament: current?.slug,
      nextStart: upcoming?.startDate,
    });

    // Rozpis: nejnovější stránka + jedna starší (pokryje celý split).
    const events: RawEvent[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 2; page++) {
      const sRes = await gw<{ data: { schedule: { pages: { older?: string | null }; events: RawEvent[] } } }>(
        'getSchedule',
        pageToken ? { leagueId: raw.id, pageToken } : { leagueId: raw.id },
      );
      events.push(...sRes.data.schedule.events);
      pageToken = sRes.data.schedule.pages.older ?? undefined;
      if (!pageToken) break;
    }
    for (const ev of events) {
      const m = toMatch(ev, tracked.slug, tours);
      if (m) matches.push(m);
    }

    if (current) {
      const stRes = await gw<{ data: { standings: Array<{ stages: Array<{ name: string; sections: Array<{ name: string; rankings?: Array<{ ordinal: number; teams: RawTeam[] }>; matches?: Array<{ id: string; state: string; teams: RawTeam[] }> }> }> }> } }>(
        'getStandings',
        { tournamentId: current.id },
      );
      const stages = stRes.data.standings[0]?.stages ?? [];
      const ranked = stages.find((s) => s.sections.some((sec) => (sec.rankings ?? []).length > 0));
      if (ranked) {
        const sec = ranked.sections.find((x) => (x.rankings ?? []).length > 0)!;
        standings.push({
          league: tracked.slug,
          tournament: current.slug,
          stage: ranked.name,
          rows: (sec.rankings ?? []).flatMap((r) =>
            r.teams.map((t) => ({
              rank: r.ordinal,
              code: plainText(t.code),
              name: plainText(t.name),
              slug: t.slug,
              wins: t.record?.wins ?? 0,
              losses: t.record?.losses ?? 0,
            })),
          ),
        });
      }
      if (tracked.group === 'international') {
        const ko = [...stages].reverse().find((s) => /knockout|bracket|playoff/i.test(s.name) && s.sections.some((x) => (x.matches ?? []).length > 0));
        if (ko) {
          const raws = ko.sections.flatMap((s) => s.matches ?? []);
          const byId = new Map(matches.map((m) => [m.id, m]));
          const bm: Match[] = raws.map((r) =>
            byId.get(r.id) ?? {
              id: r.id,
              league: tracked.slug,
              tournament: current.slug,
              startTime: '',
              state: normState(r.state),
              bestOf: 5,
              teams: [toTeam(r.teams[0]), toTeam(r.teams[1])],
            },
          );
          brackets.push({ tournament: current.slug, league: tracked.slug, name: tournamentName(tracked.name, current.slug), rounds: toRounds(bm) });
        }
      }
    }
  }

  const teamsRes = await gw<{ data: { teams: Array<{ slug: string; name: string; code: string; image?: string; status?: string; homeLeague?: { name?: string }; players?: Array<{ id: string; summonerName: string; firstName?: string; lastName?: string; image?: string; role?: string }> }> } }>('getTeams');
  const trackedByName = new Map(TRACKED_LEAGUES.map((l) => [l.name.toLowerCase(), l.slug]));
  const teams: Team[] = [];
  for (const t of teamsRes.data.teams) {
    const league = trackedByName.get((t.homeLeague?.name ?? '').toLowerCase());
    if (!league || t.status === 'archived') continue;
    const teamSlug = t.slug;
    const players: Player[] = (t.players ?? []).map((p) => ({
      slug: '',
      handle: plainText(p.summonerName),
      name: plainText([p.firstName, p.lastName].filter(Boolean).join(' ')) || undefined,
      role: (p.role ?? 'none').toLowerCase(),
      team: teamSlug,
      image: imageUrl(p.image),
    }));
    teams.push({ slug: teamSlug, code: plainText(t.code), name: plainText(t.name), league, image: imageUrl(t.image), players });
  }
  assignPlayerSlugs(teams);

  // doplnit slug týmu do zápasů podle kódu v rámci ligy
  const codeToSlug = new Map<string, string>();
  for (const t of teams) codeToSlug.set(`${t.league}|${t.code}`, t.slug);
  const anyCode = new Map<string, string>();
  for (const t of teams) if (!anyCode.has(t.code)) anyCode.set(t.code, t.slug);
  for (const m of [...matches, ...brackets.flatMap((b) => b.rounds.flatMap((r) => r.matches))]) {
    for (const t of m.teams) t.slug ??= codeToSlug.get(`${m.league}|${t.code}`) ?? anyCode.get(t.code);
  }

  return { leagues, matches: dedupeMatches(matches), standings, teams, brackets, tournaments };
}

function normState(s: string): Match['state'] {
  if (s === 'completed') return 'completed';
  if (s === 'inProgress') return 'inProgress';
  return 'unstarted';
}

function toTeam(t: RawTeam | undefined): MatchTeam {
  return {
    code: plainText(t?.code) || 'TBD',
    name: plainText(t?.name) || 'Bude určen',
    slug: t?.slug,
    image: imageUrl(t?.image),
    gameWins: t?.result?.gameWins ?? undefined,
    outcome: t?.result?.outcome === 'win' ? 'win' : t?.result?.outcome === 'loss' ? 'loss' : undefined,
  };
}

function toMatch(ev: RawEvent, league: string, tours: RawTournament[]): Match | undefined {
  if (ev.type !== 'match' || !ev.match || ev.match.teams.length < 2) return undefined;
  const day = ev.startTime.slice(0, 10);
  const tour = tours.find((t) => t.startDate <= day && day <= t.endDate);
  return {
    id: ev.match.id,
    league,
    tournament: tour?.slug,
    startTime: ev.startTime,
    state: normState(ev.state),
    block: plainText(ev.blockName) || undefined,
    bestOf: ev.match.strategy?.count ?? 1,
    teams: [toTeam(ev.match.teams[0]), toTeam(ev.match.teams[1])],
  };
}

function dedupeMatches(ms: Match[]): Match[] {
  const map = new Map<string, Match>();
  for (const m of ms) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

const ROUND_NAMES: Record<number, string> = { 1: 'Finále', 2: 'Semifinále', 4: 'Čtvrtfinále', 8: 'Osmifinále' };

/** Rozdělí zápasy play-off do kol podle počtu (4 + 2 + 1 = 7). Jiné počty → jedno kolo. */
export function toRounds(ms: Match[]): BracketRound[] {
  const n = ms.length;
  const k = Math.log2(n + 1);
  if (!Number.isInteger(k) || k < 1) return [{ name: 'Zápasy', matches: ms }];
  const rounds: BracketRound[] = [];
  let offset = 0;
  for (let size = 2 ** (k - 1); size >= 1; size /= 2) {
    rounds.push({ name: ROUND_NAMES[size] ?? `Kolo (${size})`, matches: ms.slice(offset, offset + size) });
    offset += size;
  }
  return rounds;
}


function assignPlayerSlugs(teams: Team[]): void {
  const used = new Map<string, number>();
  for (const t of teams) for (const p of t.players) used.set(slugify(p.handle), (used.get(slugify(p.handle)) ?? 0) + 1);
  for (const t of teams) {
    for (const p of t.players) {
      const base = slugify(p.handle);
      p.slug = (used.get(base) ?? 0) > 1 ? `${base}-${slugify(t.code)}` : base;
    }
  }
}
