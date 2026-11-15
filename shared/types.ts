// Doménové typy sdílené pipeline (Node) a webem (Astro + prohlížeč).
// Zdroje (lolesports, Leaguepedia) se na tyto typy převádějí na hranici v pipeline/sources/*.

export type MatchState = 'unstarted' | 'inProgress' | 'completed';

export interface MatchTeam {
  code: string;
  name: string;
  slug?: string;
  image?: string;
  gameWins?: number;
  outcome?: 'win' | 'loss' | 'tie';
  czsk?: Array<'CZ' | 'SK'>;
}

export interface Game {
  n: number;
  winnerCode?: string;
  durationSec?: number;
}

/** Jedna strana v jedné hře (modrá = první na výběr strany, červená). Pořadí výběrů i hráčů: Top, Jungle, Mid, ADC, Support. */
export interface GameSide {
  name: string;
  code?: string;
  kills?: number;
  gold?: number;
  towers?: number;
  dragons?: number;
  barons?: number;
  heralds?: number;
  grubs?: number;
  inhibitors?: number;
  picks: string[];
  bans: string[];
  players: string[];
}

/** Podrobnosti jedné hry série pro stránku zápasu (jen při buildu, do prohlížeče se neposílají). */
export interface GameDetail {
  n: number;
  winnerCode?: string;
  durationSec?: number;
  patch?: string;
  vod?: string;
  blue: GameSide;
  red: GameSide;
}

export interface Match {
  id: string;
  league: string; // slug ligy
  tournament?: string; // slug turnaje (např. worlds_2026)
  startTime: string; // ISO UTC
  state: MatchState;
  block?: string;
  bestOf: number;
  teams: [MatchTeam, MatchTeam];
  games?: Game[];
}

export interface StandingRow {
  rank: number;
  code: string;
  name: string;
  slug?: string;
  wins: number;
  losses: number;
}

export interface Standings {
  league: string;
  tournament: string;
  stage: string;
  rows: StandingRow[];
}

export interface Player {
  slug: string;
  handle: string;
  name?: string;
  role: string; // top | jungle | mid | bottom | support | none
  team: string; // slug týmu
  image?: string;
  /** kód státu (ISO 3166-1 alpha-2, např. „KR“; části Británie „GB-ENG“) */
  country?: string;
}

export interface Team {
  slug: string;
  code: string;
  name: string;
  league: string;
  image?: string;
  players: Player[];
}

export type TransferType = 'move' | 'leave' | 'join' | 'retire' | 'role';
export type TransferStatus = 'confirmed' | 'rumor' | 'withdrawn';

export interface Transfer {
  key: string;
  player: string;
  playerSlug?: string;
  role?: string;
  roleTo?: string;
  type: TransferType;
  from?: string;
  to?: string;
  fromLeague?: string;
  toLeague?: string;
  loan?: boolean;
  status: TransferStatus;
  date: string; // YYYY-MM-DD
  firstSeen: string; // ISO
  withdrawnAt?: string; // ISO
  source?: { url: string; site?: string };
  czsk?: 'CZ' | 'SK';
  /** kód státu hráče (vlajka u přestupu) */
  country?: string;
}

export interface CzSkPlayer {
  handle: string;
  name?: string;
  country: 'CZ' | 'SK';
  role: string;
  team: string; // název týmu z Leaguepedie (u volného hráče poslední tým ze soupisky)
  teamSlug?: string;
  freeAgent?: boolean;
  league?: string;
  playerSlug?: string;
}

export interface BracketRound {
  name: string;
  matches: Match[];
}

export interface Bracket {
  tournament: string;
  league: string;
  name: string;
  rounds: BracketRound[];
}

export interface LeagueInfo {
  slug: string;
  name: string;
  region: string;
  group: 'major' | 'regional' | 'international';
  image?: string;
  currentTournament?: string;
  nextStart?: string; // YYYY-MM-DD, pokud je známý
}

export type SourceKey = 'lolesports' | 'leaguepedia';

export interface SourceStatus {
  lastSuccess?: string; // ISO
  lastError?: string;
  lastAttempt?: string;
}

export interface Meta {
  buildId: string;
  generatedAt: string;
  sources: Record<SourceKey, SourceStatus>;
}

export interface CatalogEntry {
  id: string;
  label: string;
  group?: string; // popisek skupiny (region, liga, kód týmu)
  league?: string; // slug ligy (tým, hráč, turnaj)
  team?: string; // slug týmu (hráč)
  code?: string; // kód týmu (tým)
  image?: string; // logo (tým, liga)
  country?: string; // kód státu (hráč)
}

export interface Catalog {
  leagues: CatalogEntry[];
  teams: CatalogEntry[];
  players: CatalogEntry[];
  tournaments: CatalogEntry[];
}
