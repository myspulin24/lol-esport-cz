// Odhad soupisky na další split: dnešní soupiska + potvrzené změny + neoficiální zprávy (přestupy za posledních 45 dní).
// Není to oficiální soupiska; každá položka nese zdroj, ze kterého vychází.

import type { Team, Transfer } from './types';
import { teamKey } from './team-key';

export type RoleKey = 'top' | 'jungle' | 'mid' | 'bottom' | 'support' | 'none';
export const MAIN_ROLES: RoleKey[] = ['top', 'jungle', 'mid', 'bottom', 'support'];

/** stays = beze změny, new = potvrzený příchod, rumor-in = spekulace o příchodu, rumor-out = spekulace o odchodu */
export type SlotStatus = 'stays' | 'new' | 'rumor-out' | 'rumor-in';

export interface ProjectedPlayer {
  handle: string;
  slug?: string;
  country?: string;
  role: RoleKey;
  status: SlotStatus;
  /** new / rumor-in: odkud přichází; rumor-out: kam má namířeno (může být víc týmů) */
  teams: string[];
  source?: Transfer['source'];
  date?: string;
}

export interface Departure {
  handle: string;
  slug?: string;
  country?: string;
  role: RoleKey;
  to?: string;
  retired?: boolean;
  /** kam se o hráči dál spekuluje */
  rumoredTo: string[];
  source?: Transfer['source'];
  date: string;
}

export type RoleState = 'set' | 'uncertain' | 'open';

export interface ProjectedRole {
  role: RoleKey;
  state: RoleState;
  players: ProjectedPlayer[];
}

export interface Projection {
  roles: ProjectedRole[];
  departures: Departure[];
  /** liší se odhad od dnešní soupisky? */
  changed: boolean;
  counts: Record<RoleState, number>;
}

export function normalizeRole(role: string | undefined): RoleKey {
  const r = (role ?? '').toLowerCase().trim();
  if (r === 'top') return 'top';
  if (r === 'jungle' || r === 'jungler') return 'jungle';
  if (r === 'mid' || r === 'middle') return 'mid';
  if (r === 'bot' || r === 'bottom' || r === 'adc' || r === 'ad carry') return 'bottom';
  if (r === 'support' || r === 'sup') return 'support';
  return 'none';
}

const STATUS_ORDER: SlotStatus[] = ['stays', 'new', 'rumor-out', 'rumor-in'];

export function projectRoster(team: Team, transfers: Transfer[]): Projection {
  const key = teamKey(team.name);
  const mine = (name?: string) => !!name && teamKey(name) === key;
  const relevant = transfers
    .filter((t) => t.status !== 'withdrawn' && (mine(t.from) || mine(t.to)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.firstSeen.localeCompare(b.firstSeen));

  const roster = new Map<string, ProjectedPlayer>();
  for (const p of team.players) {
    roster.set(p.handle.toLowerCase(), { handle: p.handle, slug: p.slug, country: p.country, role: normalizeRole(p.role), status: 'stays', teams: [] });
  }
  const gone = new Map<string, Departure>();

  // 1) potvrzené změny, od nejstarší: poslední potvrzená událost hráče rozhoduje, jestli v týmu je
  for (const t of relevant.filter((x) => x.status === 'confirmed')) {
    const id = t.player.toLowerCase();
    const current = roster.get(id);
    if (t.type === 'role') {
      if (current && mine(t.to)) current.role = normalizeRole(t.roleTo) === 'none' ? current.role : normalizeRole(t.roleTo);
      continue;
    }
    if (mine(t.from) && !mine(t.to)) {
      roster.delete(id);
      const role = normalizeRole(t.role);
      gone.set(id, {
        handle: current?.handle ?? t.player,
        slug: current?.slug ?? t.playerSlug,
        country: current?.country ?? t.country,
        role: role === 'none' ? current?.role ?? 'none' : role,
        to: t.to,
        retired: t.type === 'retire' || undefined,
        rumoredTo: [],
        source: t.source,
        date: t.date,
      });
    } else if (mine(t.to) && !mine(t.from)) {
      gone.delete(id);
      const role = normalizeRole(t.role);
      roster.set(id, {
        handle: current?.handle ?? t.player,
        slug: current?.slug ?? t.playerSlug,
        country: current?.country ?? t.country,
        role: role === 'none' ? current?.role ?? 'none' : role,
        status: 'new',
        teams: t.from ? [t.from] : [],
        source: t.source,
        date: t.date,
      });
    }
  }

  // 2) neoficiální zprávy
  for (const t of relevant.filter((x) => x.status === 'rumor')) {
    const id = t.player.toLowerCase();
    if (mine(t.from) && !mine(t.to)) {
      const left = gone.get(id);
      if (left) {
        if (t.to && !left.rumoredTo.includes(t.to)) left.rumoredTo.push(t.to);
        continue;
      }
      const p = roster.get(id);
      if (!p || p.status === 'rumor-in') continue;
      if (p.status !== 'rumor-out') {
        p.status = 'rumor-out';
        p.teams = [];
      }
      if (t.to && !p.teams.includes(t.to)) p.teams.push(t.to);
      p.source = t.source ?? p.source;
      p.date = t.date;
    } else if (mine(t.to) && !mine(t.from)) {
      if (roster.has(id)) continue; // už v týmu je (nebo je příchod potvrzený)
      gone.delete(id);
      roster.set(id, {
        handle: t.player,
        slug: t.playerSlug,
        country: t.country,
        role: normalizeRole(t.role),
        status: 'rumor-in',
        teams: t.from ? [t.from] : [],
        source: t.source,
        date: t.date,
      });
    }
  }

  const players = [...roster.values()];
  const byRole = (role: RoleKey) =>
    players.filter((p) => p.role === role).sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.handle.localeCompare(b.handle));
  const stateOf = (list: ProjectedPlayer[]): RoleState => {
    const firm = list.filter((p) => p.status === 'stays' || p.status === 'new');
    if (!firm.length) return list.some((p) => p.status === 'rumor-out') ? 'uncertain' : 'open';
    return list.some((p) => p.status === 'rumor-in' || p.status === 'rumor-out') ? 'uncertain' : 'set';
  };
  const roles: ProjectedRole[] = MAIN_ROLES.map((role) => {
    const list = byRole(role);
    return { role, state: stateOf(list), players: list };
  });
  const others = byRole('none');
  if (others.length) roles.push({ role: 'none', state: stateOf(others), players: others });

  const counts: Record<RoleState, number> = { set: 0, uncertain: 0, open: 0 };
  for (const r of roles) if (r.role !== 'none') counts[r.state]++;
  const departures = [...gone.values()].sort((a, b) => b.date.localeCompare(a.date) || a.handle.localeCompare(b.handle));
  return { roles, departures, changed: departures.length > 0 || players.some((p) => p.status !== 'stays'), counts };
}

/** Jeden pohyb v přehledu: hráč odchází (kam) nebo přichází (odkud); jistý = potvrzený, jinak spekulace. */
export interface Movement {
  handle: string;
  slug?: string;
  country?: string;
  role: RoleKey;
  dir: 'out' | 'in';
  certain: boolean;
  /** out: kam jde; in: odkud přichází (prázdné = bez týmu) */
  teams: string[];
  retired?: boolean;
  /** u potvrzeného odchodu: kam se o hráči dál spekuluje */
  rumoredTo?: string[];
  source?: Transfer['source'];
}

/** Přehled pohybů z odhadu: nejdřív potvrzené, pak spekulace; v každé skupině podle jména. */
export function movements(p: Projection): { out: Movement[]; in: Movement[] } {
  const players = p.roles.flatMap((r) => r.players);
  const order = (a: Movement, b: Movement) => Number(b.certain) - Number(a.certain) || a.handle.localeCompare(b.handle);
  const out: Movement[] = [
    ...p.departures.map((d): Movement => ({ handle: d.handle, slug: d.slug, country: d.country, role: d.role, dir: 'out', certain: true, teams: d.to ? [d.to] : [], retired: d.retired, rumoredTo: d.rumoredTo, source: d.source })),
    ...players.filter((x) => x.status === 'rumor-out').map((x): Movement => ({ handle: x.handle, slug: x.slug, country: x.country, role: x.role, dir: 'out', certain: false, teams: x.teams, source: x.source })),
  ].sort(order);
  const inc: Movement[] = players
    .filter((x) => x.status === 'new' || x.status === 'rumor-in')
    .map((x): Movement => ({ handle: x.handle, slug: x.slug, country: x.country, role: x.role, dir: 'in', certain: x.status === 'new', teams: x.teams, source: x.source }))
    .sort(order);
  return { out, in: inc };
}
