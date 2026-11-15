// Načtení dat při buildu (Astro běží v Node). Zdroj = site/public/data/*.json z pipeline.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Bracket, Catalog, CzSkPlayer, GameDetail, LeagueInfo, Match, Meta, Standings, Team, Transfer } from '../../../shared/types';
import type { RenderData, Streamer } from '../../../shared/render';
import { TRACKED_LEAGUES } from '../../../shared/leagues';

const DATA = join(process.cwd(), 'site', 'public', 'data');
/** jen pro build: podrobnosti her pro stránky zápasů (pipeline je zapisuje mimo veřejnou složku) */
const MATCH_DETAILS = join(process.cwd(), 'cache', 'build', 'match-details.json');

function read<T>(rel: string, fallback: T): T {
  const p = join(DATA, rel);
  if (!existsSync(p)) return fallback;
  try {
    return (JSON.parse(readFileSync(p, 'utf8')) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function readDetails(): Record<string, GameDetail[]> {
  if (!existsSync(MATCH_DETAILS)) return {};
  try {
    return (JSON.parse(readFileSync(MATCH_DETAILS, 'utf8')) as Record<string, GameDetail[]>) ?? {};
  } catch {
    return {};
  }
}

let cache: (RenderData & { tournaments: Array<{ slug: string; league: string; name: string; startDate: string; endDate: string }>; matchDetails: Record<string, GameDetail[]> }) | undefined;

export function loadData() {
  if (cache) return cache;
  const schedule: Record<string, Match[]> = {};
  const standings: Record<string, Standings | null> = {};
  const teams: Record<string, Team[]> = {};
  for (const l of TRACKED_LEAGUES) {
    schedule[l.slug] = read<Match[]>(`schedule/${l.short}.json`, []);
    standings[l.slug] = read<Standings | null>(`standings/${l.short}.json`, null);
    teams[l.slug] = read<Team[]>(`teams/${l.short}.json`, []);
  }
  const tournaments = read<Array<{ slug: string; league: string; name: string; startDate: string; endDate: string }>>('tournaments.json', []);
  const brackets: Record<string, Bracket> = {};
  for (const t of tournaments) {
    const b = read<Bracket | null>(`brackets/${t.slug}.json`, null);
    if (b) brackets[t.slug] = b;
  }
  const meta = read<Meta | undefined>('meta.json', undefined);
  cache = {
    // „teď“ pro předgenerované HTML = čas vygenerování dat; prohlížeč pak přepočítá relativní časy.
    now: meta ? new Date(meta.generatedAt) : new Date(),
    meta,
    leagues: read<LeagueInfo[]>('leagues.json', []),
    catalog: read<Catalog>('catalog.json', { leagues: [], teams: [], players: [], tournaments: [] }),
    upcoming: read<Match[]>('upcoming.json', []),
    schedule,
    standings,
    teams,
    brackets,
    transfers: read<Transfer[]>('transfers.json', []),
    czsk: read<CzSkPlayer[]>('czsk.json', []),
    streamers: read<Record<string, Streamer[]>>('streamers.json', {}),
    tournaments,
    matchDetails: readDetails(),
  };
  return cache;
}

export function allTeams(): Team[] {
  return Object.values(loadData().teams).flat().filter((t): t is Team => !!t);
}
