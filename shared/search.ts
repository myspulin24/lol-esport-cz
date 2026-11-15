// Hledání týmů, hráčů, lig a turnajů v katalogu: jeden zdroj pro našeptávač v hlavičce i stránku /hledat/.

import type { Catalog } from './types';
import { leagueName, leagueShort } from './leagues';

export type HitKind = 'team' | 'league' | 'tournament' | 'player';

export interface SearchItem {
  kind: HitKind;
  /** ID v katalogu (slug týmu, hráče, ligy, turnaje) */
  id: string;
  label: string;
  /** druhý řádek: liga, tým, region */
  sub: string;
  href: string;
  image?: string;
  country?: string;
  /** normalizované texty pro porovnání */
  name: string;
  code: string;
  extra: string[];
}

export interface Hit extends SearchItem {
  score: number;
}

export const KIND_LABEL: Record<HitKind, string> = { team: 'tým', league: 'liga', tournament: 'turnaj', player: 'hráč' };
export const KIND_GROUP: Record<HitKind, string> = { team: 'Týmy', league: 'Ligy', tournament: 'Turnaje', player: 'Hráči' };
const KIND_ORDER: HitKind[] = ['team', 'league', 'tournament', 'player'];

/** Malá písmena bez diakritiky: „Čeští“ → „cesti“. */
export function normText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function buildIndex(catalog: Catalog): SearchItem[] {
  const teamById = new Map(catalog.teams.map((t) => [t.id, t]));
  const teamName = (label: string) => label.replace(/\s*\([^)]*\)\s*$/, '');
  return [
    ...catalog.teams.map((t): SearchItem => {
      const name = teamName(t.label);
      const code = t.code ?? t.label.match(/\(([^)]+)\)\s*$/)?.[1] ?? '';
      return { kind: 'team', id: t.id, label: name, sub: [code, t.group].filter(Boolean).join(' · '), href: `/tym/${t.id}/`, image: t.image, name: normText(name), code: normText(code), extra: [] };
    }),
    ...catalog.leagues.map(
      (l): SearchItem => ({ kind: 'league', id: l.id, label: l.label, sub: l.group ?? '', href: `/liga/${leagueShort(l.id)}/`, image: l.image, name: normText(l.label), code: normText(leagueShort(l.id)), extra: [normText(l.group ?? '')] }),
    ),
    ...catalog.tournaments.map(
      (t): SearchItem => ({ kind: 'tournament', id: t.id, label: t.label, sub: 'pavouk a výsledky', href: `/turnaj/${t.id}/`, name: normText(t.label), code: '', extra: [] }),
    ),
    ...catalog.players.map((p): SearchItem => {
      const team = p.team ? teamById.get(p.team) : undefined;
      return {
        kind: 'player',
        id: p.id,
        label: p.label,
        sub: [p.group, p.league ? leagueName(p.league) : ''].filter(Boolean).join(' · '),
        href: `/hrac/${p.id}/`,
        country: p.country,
        name: normText(p.label),
        code: '',
        extra: [normText(p.group ?? ''), team ? normText(teamName(team.label)) : ''].filter(Boolean),
      };
    }),
  ];
}

function scoreOf(item: SearchItem, q: string): number {
  if (item.name === q) return 100;
  if (item.code && item.code === q) return 95;
  if (item.name.startsWith(q)) return 80;
  if (item.name.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 70;
  if (item.code && item.code.startsWith(q)) return 65;
  if (item.name.includes(q)) return 50;
  // hráč podle týmu: „g2“ ukáže i soupisku G2
  if (item.extra.some((e) => e === q)) return 40;
  if (q.length >= 3 && item.extra.some((e) => e.startsWith(q))) return 30;
  return 0;
}

/** Nejlepší shody, seřazené podle shody, pak typu (tým, liga, turnaj, hráč) a abecedy. */
export function findHits(index: SearchItem[], query: string, limit = 8): Hit[] {
  const q = normText(query);
  if (!q) return [];
  return index
    .map((item) => ({ ...item, score: scoreOf(item, q) }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.label.localeCompare(b.label, 'cs'))
    .slice(0, limit);
}

/** Skupiny pro zobrazení: v pořadí, v jakém se typy objevují mezi nejlepšími shodami. */
export function groupHits(hits: Hit[]): Array<{ kind: HitKind; hits: Hit[] }> {
  const groups: Array<{ kind: HitKind; hits: Hit[] }> = [];
  for (const h of hits) {
    let g = groups.find((x) => x.kind === h.kind);
    if (!g) groups.push((g = { kind: h.kind, hits: [] }));
    g.hits.push(h);
  }
  return groups;
}

/** Rozdělí popisek na [před, shoda, za] pro zvýraznění; bez shody (nebo když diakritika mění délku) vrátí jen text. */
export function splitMatch(label: string, query: string): [string, string, string] {
  const q = normText(query);
  const n = normText(label);
  const i = q ? n.indexOf(q) : -1;
  if (i < 0 || n.length !== label.trim().length) return [label, '', ''];
  const text = label.trim();
  return [text.slice(0, i), text.slice(i, i + q.length), text.slice(i + q.length)];
}
