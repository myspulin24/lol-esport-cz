// config/streameri.yaml → ověřená mapa liga → costreameři.
// Neznámý klíč ligy nebo neplatný odkaz zastaví build (eng review, Section 1 #6: překlep nesmí tiše schovat odkazy).

import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { LEAGUE_BY_SLUG } from '../shared/leagues';
import { safeUrl } from '../shared/safe-url';
import type { Streamer } from '../shared/render';

export function validateStreamers(raw: unknown): Record<string, Streamer[]> {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('streameri.yaml: kořen musí být mapa liga → seznam');
  const out: Record<string, Streamer[]> = {};
  for (const [league, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!LEAGUE_BY_SLUG.has(league)) {
      throw new Error(`streameri.yaml: neznámý klíč ligy „${league}“. Povolené: ${[...LEAGUE_BY_SLUG.keys()].join(', ')}`);
    }
    if (list == null) continue;
    if (!Array.isArray(list)) throw new Error(`streameri.yaml: „${league}“ musí být seznam`);
    out[league] = list.map((s, i) => {
      const name = (s as { name?: unknown })?.name;
      const url = safeUrl((s as { url?: unknown })?.url);
      if (typeof name !== 'string' || !name.trim() || !url) throw new Error(`streameri.yaml: ${league}[${i}] potřebuje name a http(s) url`);
      return { name: name.trim(), url };
    });
  }
  return out;
}

export async function loadStreamers(path: string): Promise<Record<string, Streamer[]>> {
  const text = await readFile(path, 'utf8');
  return validateStreamers(parse(text));
}
