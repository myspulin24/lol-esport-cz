// Přestupy ze strukturovaných dat (design doc „Obsah generovaný z dat“, R8/D13, D24).
// - jen hráči, žádní trenéři a štáb (R8)
// - varianty: move (A → B), leave (A → bez týmu), join (bez týmu → B), retire, role (role X → Y v týmu), štítek hostování
// - klíč položky = (hráč, odkud|—, kam|—, sezóna, typ)
// - životní cyklus: neoficiální → potvrzeno upraví existující položku; zmizelá/zrušená neoficiální zpráva
//   je 7 dní „withdrawn“ (přeškrtnutá), pak se odstraní.

import type { Transfer } from '../shared/types';
import type { RosterChangeRow, RumorRow } from './sources/leaguepedia';
import { normName } from './util';
import { teamKey } from '../shared/team-key';

export const WITHDRAWN_KEEP_DAYS = 7;
const PAIR_WINDOW_DAYS = 10;
const INGAME = new Set(['top', 'jungle', 'mid', 'bot', 'support', 'adc']);

export interface TransferContext {
  /** teamKey(název týmu) → slug ligy (pro filtr podle ligy) */
  teamLeague: Map<string, string>;
  /** handle hráče (lowercase) → CZ/SK */
  czsk: Map<string, 'CZ' | 'SK'>;
  /** handle hráče (lowercase) → slug stránky hráče */
  playerSlug: Map<string, string>;
}

export function seasonOf(date: string): number {
  const [y, m] = date.split('-').map(Number);
  return m >= 11 ? y + 1 : y; // listopadové a prosincové přestupy jsou pro další sezónu
}

export function transferKey(t: Pick<Transfer, 'player' | 'from' | 'to' | 'date' | 'type'>): string {
  return [normName(t.player), t.from ? normName(t.from) : '-', t.to ? normName(t.to) : '-', seasonOf(t.date), t.type].join('|');
}

function isPlayerChange(r: RosterChangeRow): boolean {
  if (r.rolesIngame) return true;
  if (r.rolesStaff) return false;
  return INGAME.has(r.role.toLowerCase());
}

function isRetire(r: RosterChangeRow): boolean {
  return /retir/i.test(`${r.status} ${r.role} ${r.roleModifier}`);
}

function isLoan(r: RosterChangeRow): boolean {
  return /loan/i.test(`${r.status} ${r.roleModifier}`);
}

function daysBetween(a: string, b: string): number {
  return Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

function baseName(player: string): string {
  // Leaguepedia odlišuje stejnojmenné hráče závorkou: „Zest (Kim Dong-min)“
  return player.replace(/\s*\(.*\)\s*$/, '').trim();
}

/** Potvrzené změny z RosterChanges → položky přestupů. */
export function changesToTransfers(rows: RosterChangeRow[], nowIso: string): Transfer[] {
  const players = rows.filter(isPlayerChange).sort((a, b) => a.date.localeCompare(b.date));
  const used = new Set<RosterChangeRow>();
  const out: Transfer[] = [];
  for (const leave of players.filter((r) => r.direction === 'Leave')) {
    if (used.has(leave)) continue;
    const join = players.find(
      (j) => !used.has(j) && j.direction === 'Join' && j.player === leave.player && daysBetween(j.date, leave.date) <= PAIR_WINDOW_DAYS,
    );
    used.add(leave);
    if (join) {
      used.add(join);
      const sameTeam = normName(join.team) === normName(leave.team);
      if (sameTeam && normName(join.role) === normName(leave.role)) continue; // bez změny
      out.push(
        make(
          sameTeam
            ? { type: 'role', from: leave.team, to: join.team, role: leave.role, roleTo: join.role }
            : { type: 'move', from: leave.team, to: join.team, role: join.role || leave.role },
          join.date > leave.date ? join : leave,
          isLoan(join),
          nowIso,
        ),
      );
    } else {
      out.push(make(isRetire(leave) ? { type: 'retire', from: leave.team, role: leave.role } : { type: 'leave', from: leave.team, role: leave.role }, leave, false, nowIso));
    }
  }
  for (const join of players.filter((r) => r.direction === 'Join' && !used.has(r))) {
    out.push(make({ type: 'join', to: join.team, role: join.role }, join, isLoan(join), nowIso));
  }
  return out;
}

function make(
  base: Pick<Transfer, 'type' | 'from' | 'to' | 'role' | 'roleTo'>,
  row: RosterChangeRow,
  loan: boolean,
  nowIso: string,
): Transfer {
  const t: Transfer = {
    key: '',
    player: baseName(row.player),
    type: base.type,
    from: base.from || undefined,
    to: base.to || undefined,
    role: base.role || undefined,
    roleTo: base.roleTo || undefined,
    loan: loan || undefined,
    status: 'confirmed',
    date: row.date,
    firstSeen: nowIso,
    source: row.sourceUrl ? { url: row.sourceUrl, site: row.sourceSite } : undefined,
    country: row.country,
  };
  t.key = transferKey(t);
  return t;
}

/** Leaguepedia píše u drbů místo týmu i „Free Agent“ / „None“: to není tým, hráč je bez týmu. */
export function isNoTeam(name: string | undefined): boolean {
  return !name || /^(free agents?|none|tbd|unknown)$/i.test(name.trim());
}

/** Herní role (nebo neuvedená); trenérské a štábní role ne. */
export function isPlayerRole(role: string | undefined): boolean {
  return !role || INGAME.has(role.trim().toLowerCase());
}

function teamOrNone(name: string | undefined): string | undefined {
  return isNoTeam(name) ? undefined : name;
}

/** Neoficiální zprávy z RosterRumors. „Zůstává v týmu“ (start = konec) se nezobrazuje. */
export function rumorsToTransfers(rows: RumorRow[], nowIso: string): { active: Transfer[]; cancelledKeys: Set<string> } {
  const active: Transfer[] = [];
  const cancelledKeys = new Set<string>();
  for (const r of rows) {
    // R8: jen hráči. Drby o trenérech a štábu (Head Coach, Strategic Coach…) se nezobrazují.
    if (!isPlayerRole(r.roleEnd || r.roleStart)) continue;
    const from = teamOrNone(r.teamStart);
    const to = teamOrNone(r.teamEnd);
    if (!from && !to) continue;
    if (from && to && normName(from) === normName(to)) continue;
    const type: Transfer['type'] = from && to ? 'move' : from ? 'leave' : 'join';
    const t: Transfer = {
      key: '',
      player: baseName(r.player),
      type,
      from,
      to,
      role: r.roleEnd || r.roleStart || undefined,
      status: 'rumor',
      date: r.date,
      firstSeen: nowIso,
      source: r.sourceUrl ? { url: r.sourceUrl, site: r.sourceSite } : undefined,
      country: r.country,
    };
    t.key = transferKey(t);
    if (r.notHappening || r.isOver) cancelledKeys.add(t.key);
    else active.push(t);
  }
  return { active, cancelledKeys };
}

/**
 * Sloučí potvrzené změny, aktivní drby a předchozí stav (životní cyklus).
 * Vrací nový stav seřazený od nejnovějšího.
 */
export function mergeTransfers(
  previous: Transfer[],
  confirmed: Transfer[],
  rumors: { active: Transfer[]; cancelledKeys: Set<string> },
  now: Date,
  ctx?: TransferContext,
): Transfer[] {
  const nowIso = now.toISOString();
  // starší stav mohl mít „Free Agent“ jako název týmu: takové položky zahodit, vzniknou znovu ve správné podobě
  // totéž pro dřívější drby o trenérech: zahodit, ať nezůstanou týden viset jako „stažené“
  previous = previous.filter((t) => !(t.from && isNoTeam(t.from)) && !(t.to && isNoTeam(t.to)) && (t.status === 'confirmed' || isPlayerRole(t.role)));
  const prevByKey = new Map(previous.map((t) => [t.key, t]));
  const next = new Map<string, Transfer>();

  for (const c of confirmed) {
    const prev = prevByKey.get(c.key);
    next.set(c.key, { ...c, firstSeen: prev?.firstSeen ?? c.firstSeen, source: c.source ?? prev?.source, country: c.country ?? prev?.country });
  }
  for (const r of rumors.active) {
    if (next.has(r.key)) continue; // už potvrzeno → položka zůstává jedna
    const prev = prevByKey.get(r.key);
    next.set(r.key, { ...r, firstSeen: prev?.firstSeen ?? r.firstSeen, country: r.country ?? prev?.country });
  }
  // dřívější drby, které ze zdroje zmizely nebo byly zrušeny → withdrawn na 7 dní
  for (const prev of previous) {
    if (next.has(prev.key)) continue;
    if (prev.status === 'confirmed') {
      // potvrzené položky mimo okno zdroje necháme, dokud nejsou starší než okno (45 dní)
      if (Date.parse(prev.date) >= now.getTime() - 45 * 86_400_000) next.set(prev.key, prev);
      continue;
    }
    const withdrawnAt = prev.status === 'withdrawn' ? prev.withdrawnAt ?? nowIso : nowIso;
    if (now.getTime() - Date.parse(withdrawnAt) > WITHDRAWN_KEEP_DAYS * 86_400_000) continue;
    next.set(prev.key, { ...prev, status: 'withdrawn', withdrawnAt });
  }
  for (const key of rumors.cancelledKeys) {
    const t = next.get(key);
    if (t && t.status === 'rumor') next.set(key, { ...t, status: 'withdrawn', withdrawnAt: nowIso });
  }

  const out = [...next.values()];
  if (ctx) {
    for (const t of out) {
      t.fromLeague = t.from ? ctx.teamLeague.get(teamKey(t.from)) : undefined;
      t.toLeague = t.to ? ctx.teamLeague.get(teamKey(t.to)) : undefined;
      t.czsk = ctx.czsk.get(t.player.toLowerCase());
      if (t.czsk) t.country = t.czsk;
      t.playerSlug = ctx.playerSlug.get(t.player.toLowerCase());
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.player.localeCompare(b.player));
}
