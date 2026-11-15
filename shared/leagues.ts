// Sledované soutěže. Pořadí = pořadí v nabídkách.
// Pozn.: v roce 2026 vrátil Riot LCS a CBLOL místo LTA (podle getLeagues API).

export interface TrackedLeague {
  slug: string; // slug v lolesports API
  short: string; // krátký slug pro URL na webu
  name: string;
  region: string;
  group: 'major' | 'regional' | 'international';
  /** Soutěž rozhoduje o tom, zda je „v sezóně“ (D12/R2-1). */
  seasonDefining: boolean;
}

export const TRACKED_LEAGUES: TrackedLeague[] = [
  { slug: 'lck', short: 'lck', name: 'LCK', region: 'Korea', group: 'major', seasonDefining: true },
  { slug: 'lpl', short: 'lpl', name: 'LPL', region: 'Čína', group: 'major', seasonDefining: true },
  { slug: 'lec', short: 'lec', name: 'LEC', region: 'Evropa', group: 'major', seasonDefining: true },
  { slug: 'lcs', short: 'lcs', name: 'LCS', region: 'Severní Amerika', group: 'major', seasonDefining: true },
  { slug: 'cblol-brazil', short: 'cblol', name: 'CBLOL', region: 'Brazílie', group: 'major', seasonDefining: false },
  { slug: 'lcp', short: 'lcp', name: 'LCP', region: 'Pacifik', group: 'major', seasonDefining: false },
  { slug: 'hitpoint_masters', short: 'hitpoint-masters', name: 'Hitpoint Masters', region: 'Česko a Slovensko', group: 'regional', seasonDefining: false },
  { slug: 'first_stand', short: 'first-stand', name: 'First Stand', region: 'Mezinárodní', group: 'international', seasonDefining: true },
  { slug: 'msi', short: 'msi', name: 'MSI', region: 'Mezinárodní', group: 'international', seasonDefining: true },
  { slug: 'worlds', short: 'worlds', name: 'Worlds', region: 'Mezinárodní', group: 'international', seasonDefining: true },
];

export const LEAGUE_BY_SLUG = new Map(TRACKED_LEAGUES.map((l) => [l.slug, l]));
export const LEAGUE_BY_SHORT = new Map(TRACKED_LEAGUES.map((l) => [l.short, l]));

export function leagueName(slug: string): string {
  return LEAGUE_BY_SLUG.get(slug)?.name ?? slug;
}

export function leagueShort(slug: string): string {
  return LEAGUE_BY_SLUG.get(slug)?.short ?? slug;
}

export const SEASON_LEAGUES = TRACKED_LEAGUES.filter((l) => l.seasonDefining).map((l) => l.slug);
export const DEFAULT_RESULTS_LEAGUES = ['lck', 'lpl', 'lec'];

/** Čitelný název turnaje ze slugu lolesports: „lec_split_3_2026“ → „LEC 2026 Split 3“. */
export function tournamentName(leagueName: string, slug: string): string {
  const year = slug.match(/20\d\d/)?.[0] ?? '';
  const prefix = leagueName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const rest = slug
    .replace(/20\d\d/, '')
    .replace(new RegExp(`^${prefix}_?`), '')
    .replace(/[_-]+/g, ' ')
    .trim();
  const nice = rest
    .replace(/\bsplit (\d)\b/i, 'Split $1')
    .replace(/\bspring\b/i, 'jaro')
    .replace(/\bsummer\b/i, 'léto')
    .replace(/\bwinter\b/i, 'zima');
  return [leagueName, year, nice].filter(Boolean).join(' ').replace(/\s+/g, ' ');
}
