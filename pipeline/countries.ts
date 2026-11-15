// Státy hráčů v pipeline: anglický název z Leaguepedie → kód státu, výběr správného hráče mezi jmenovci
// a kopírování vlajek (balík flag-icons, licence MIT) jen pro státy, které se v datech opravdu vyskytují.

import { copyFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { teamKey } from '../shared/team-key';
import { isCountryCode } from '../shared/countries';

/** Názvy, které Leaguepedia píše jinak než standardní anglické názvy z Intl. */
const ALIASES: Record<string, string> = {
  'czech republic': 'CZ',
  czechia: 'CZ',
  turkey: 'TR',
  turkiye: 'TR',
  'south korea': 'KR',
  korea: 'KR',
  'north korea': 'KP',
  'hong kong': 'HK',
  macau: 'MO',
  macao: 'MO',
  taiwan: 'TW',
  'chinese taipei': 'TW',
  vietnam: 'VN',
  russia: 'RU',
  'united states': 'US',
  usa: 'US',
  'united kingdom': 'GB',
  uk: 'GB',
  'great britain': 'GB',
  england: 'GB-ENG',
  scotland: 'GB-SCT',
  wales: 'GB-WLS',
  'northern ireland': 'GB-NIR',
  kosovo: 'XK',
  'bosnia and herzegovina': 'BA',
  'north macedonia': 'MK',
  macedonia: 'MK',
  moldova: 'MD',
  'the netherlands': 'NL',
  holland: 'NL',
  'ivory coast': 'CI',
  'cape verde': 'CV',
  'dr congo': 'CD',
  myanmar: 'MM',
  burma: 'MM',
  palestine: 'PS',
  syria: 'SY',
  iran: 'IR',
  laos: 'LA',
  bolivia: 'BO',
  venezuela: 'VE',
  uae: 'AE',
  'united arab emirates': 'AE',
  reunion: 'RE',
  curacao: 'CW',
};

function norm(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let byEnglishName: Map<string, string> | undefined;

function englishNames(): Map<string, string> {
  if (byEnglishName) return byEnglishName;
  byEnglishName = new Map();
  const dn = new Intl.DisplayNames(['en'], { type: 'region' });
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const a of A) {
    for (const b of A) {
      const code = a + b;
      let name: string | undefined;
      try {
        name = dn.of(code);
      } catch {
        name = undefined;
      }
      if (name && name !== code && !/unknown/i.test(name)) byEnglishName.set(norm(name), code);
    }
  }
  return byEnglishName;
}

/** „South Korea“ → „KR“. Neznámý nebo prázdný název → undefined (raději žádná vlajka než špatná). */
export function countryCode(englishName: string | undefined): string | undefined {
  if (!englishName) return undefined;
  const key = norm(englishName);
  if (!key) return undefined;
  return ALIASES[key] ?? englishNames().get(key);
}

/** Řádek tabulky Players z Leaguepedie pro jednu přezdívku (jmenovců může být víc). */
export interface PlayerCountryRow {
  country?: string; // kód státu
  team: string;
  retired: boolean;
}

export interface PlayerCountryCache {
  [idLower: string]: { at: string; rows: PlayerCountryRow[] };
}

const DAY = 86_400_000;
const REFRESH_DAYS = 30;
const RETRY_EMPTY_DAYS = 3;

/** Které přezdívky se mají (znovu) dotázat: nové, bez výsledku starší 3 dnů, jinak starší 30 dnů. */
export function staleIds(handles: Iterable<string>, cache: PlayerCountryCache, now: Date): string[] {
  const out = new Set<string>();
  for (const h of handles) {
    const key = h.toLowerCase();
    const hit = cache[key];
    const age = hit ? now.getTime() - Date.parse(hit.at) : Infinity;
    const limit = hit && hit.rows.some((r) => r.country) ? REFRESH_DAYS : RETRY_EMPTY_DAYS;
    if (age > limit * DAY) out.add(h);
  }
  return [...out];
}

/**
 * Stát hráče podle přezdívky a týmu. Jmenovci (dva „Caps“, tři „Zest“) se rozliší týmem;
 * když to nejde jednoznačně, vlajka se neukáže.
 */
export function resolveCountry(handle: string, teamName: string | undefined, cache: PlayerCountryCache): string | undefined {
  const rows = (cache[handle.toLowerCase()]?.rows ?? []).filter((r) => r.country);
  if (!rows.length) return undefined;
  const distinct = (list: PlayerCountryRow[]) => [...new Set(list.map((r) => r.country!))];
  const all = distinct(rows);
  if (all.length === 1) return all[0];
  if (teamName) {
    const sameTeam = distinct(rows.filter((r) => r.team && teamKey(r.team) === teamKey(teamName)));
    if (sameTeam.length === 1) return sameTeam[0];
  }
  const active = distinct(rows.filter((r) => !r.retired));
  return active.length === 1 ? active[0] : undefined;
}

/** Zkopíruje vlajky použitých států do výstupu webu. Vrací kódy, pro které vlajka existuje. */
export async function copyFlags(codes: Iterable<string>, root: string, outDir: string): Promise<Set<string>> {
  const src = join(root, 'node_modules', 'flag-icons', 'flags', '4x3');
  await mkdir(outDir, { recursive: true });
  const ok = new Set<string>();
  for (const code of new Set(codes)) {
    if (!isCountryCode(code)) continue;
    const file = `${code.toLowerCase()}.svg`;
    try {
      await access(join(src, file));
      await copyFile(join(src, file), join(outDir, file));
      ok.add(code);
    } catch {
      /* vlajka v balíku není: hráč zůstane bez odznaku */
    }
  }
  return ok;
}
