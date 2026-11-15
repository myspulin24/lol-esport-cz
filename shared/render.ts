// Vykreslení řádků, dlaždic a bloků stránek (jeden zdroj pro server i prohlížeč).

import type { Bracket, Catalog, CzSkPlayer, LeagueInfo, Match, MatchTeam, Meta, SourceKey, Standings, Team, Transfer } from './types';
import { h, type Child, type VNode } from './vnode';
import { icon, type IconName } from './icons';
import { dayKey, formatAgo, formatDate, formatDuration, formatRelativeDay, formatTime, pluralDays, daysUntil, roleCs } from './format';
import { matchStatus, isInSeason } from './season';
import { leagueName, leagueShort, SEASON_LEAGUES, LEAGUE_BY_SLUG } from './leagues';
import type { TileConfig } from './dashboard-schema';
import { countryName, flagSrc, isCountryCode } from './countries';
import { MAIN_ROLES, movements, normalizeRole, projectRoster, type Movement, type Projection, type RoleKey, type SlotStatus } from './roster-projection';
import { thumbUrl } from './safe-url';
import { teamKey } from './team-key';

export const STALE_HOURS = 6;

export interface Streamer {
  name: string;
  url: string;
}

export interface RenderData {
  now: Date;
  meta?: Meta;
  leagues: LeagueInfo[];
  catalog?: Catalog;
  upcoming?: Match[];
  schedule: Record<string, Match[] | undefined>;
  standings: Record<string, Standings | null | undefined>;
  teams: Record<string, Team[] | undefined>;
  brackets: Record<string, Bracket | undefined>;
  transfers?: Transfer[];
  czsk?: CzSkPlayer[];
  streamers: Record<string, Streamer[] | undefined>;
}

// ---------- drobné prvky ----------

/** Odznak s vlajkou státu (SVG soubor; popisek = český název státu). Neznámý nebo neplatný kód → nic. */
export function flag(code: string | undefined, title?: string): VNode | null {
  if (!isCountryCode(code)) return null;
  const label = title ?? countryName(code);
  return h('span', { class: 'flag', title: label }, h('img', { src: flagSrc(code), alt: label, width: 20, height: 15, decoding: 'sync' }));
}

/** Vlajky u týmu: v soupisce je český nebo slovenský hráč. */
export function czskTags(flags?: string[] | string): Child[] {
  const list = !flags ? [] : Array.isArray(flags) ? flags : [flags];
  return list.filter((f) => f === 'CZ' || f === 'SK').map((f) => flag(f, f === 'CZ' ? 'Český hráč v týmu' : 'Slovenský hráč v týmu'));
}

/**
 * Stáří dat („před 2 min“). Na serveru (build) se vypisuje prázdné a text doplní prohlížeč z meta.json:
 * jinak by se každým během změnily všechny stránky a deploy by zbytečně nahrával stovky souborů.
 */
export function freshness(src: SourceKey, meta: Meta | undefined, now: Date): VNode {
  const title = `Data ze zdroje ${src === 'lolesports' ? 'lolesports.com' : 'Leaguepedia'}`;
  if (typeof document === 'undefined') return h('span', { class: 'fresh', 'data-src': src, title }, '');
  const last = meta?.sources[src]?.lastSuccess;
  const stale = last ? now.getTime() - Date.parse(last) > STALE_HOURS * 3_600_000 : true;
  return h('span', { class: `fresh${stale ? ' fresh--stale' : ''}`, 'data-src': src, title: last ? title : 'Data zatím nedostupná' }, formatAgo(last, now));
}

function teamLink(t: MatchTeam, label: string): VNode {
  return t.slug ? h('a', { href: `/tym/${t.slug}/`, class: 'm-tlink' }, label) : h('span', null, label);
}

// ---------- řádek zápasu (D7, D11, D23) ----------

export interface MatchRowOpts {
  now: Date;
  showDate?: boolean;
  showLeague?: boolean;
  streamers?: Streamer[];
  /** v pavouku: skrýt jména týmů v dalších kolech v režimu bez spoilerů */
  hideTeamsWhenSpoilers?: boolean;
  /** na stránce zápasu samotného odkaz na detail nedává smysl */
  noDetailLink?: boolean;
}

/** Logo týmu na tmavém „medailonu“: loga z lolesports jsou kreslená pro tmavé pozadí, takže fungují i ve světlém režimu. */
export function coin(image: string | undefined, cls = 'm-coin'): VNode {
  return h('span', { class: image ? cls : `${cls} m-coin--empty`, 'aria-hidden': 'true' }, image ? h('img', { src: image, alt: '', width: 22, height: 22, decoding: 'sync' }) : null);
}

export function matchRow(m: Match, o: MatchRowOpts): VNode {
  const st = matchStatus(m, o.now);
  const [a, b] = m.teams;
  const done = st.kind === 'final';
  const winA = done && a.outcome === 'win';
  const winB = done && b.outcome === 'win';
  const label = `${a.code}–${b.code}`;
  // Pořadí v DOM je vždy logo, kód, štítky; tým vlevo se zrcadlí v CSS, aby skóre zůstalo přesně uprostřed.
  const teamCell = (t: MatchTeam, win: boolean, side: 'a' | 'b') => {
    const id: Child[] = [coin(t.image), teamLink(t, t.code)];
    return h('span', { class: `m-team m-team--${side}${win ? ' win' : ''}` }, o.hideTeamsWhenSpoilers ? h('span', { class: 'sp-name' }, ...id) : id, ...czskTags(t.czsk));
  };
  const when = m.startTime
    ? h('time', { class: 'm-time', datetime: m.startTime }, o.showDate ? h('span', { class: 'm-day' }, formatRelativeDay(m.startTime, o.now)) : null, h('span', { class: 'm-hour' }, formatTime(m.startTime)))
    : h('span', { class: 'm-time' }, '');
  const planned = st.kind === 'upcoming' && st.label === 'naplánováno';
  const detail = /^\d+$/.test(m.id) && !o.noDetailLink ? { href: `/zapas/${m.id}/`, title: 'Detail zápasu', 'aria-label': `Detail zápasu ${label}` } : null;
  const statusTag = detail ? 'a' : 'span';
  const status = done
    ? h(
        statusTag,
        { class: 'm-status st-final', ...detail },
        h(
          'span',
          { class: 'sp', 'data-sp-label': `Odkrýt skóre ${label}` },
          h('span', { class: 'sp-v' }, h('b', { class: winA ? 'w' : undefined }, String(a.gameWins ?? 0)), h('span', { class: 'colon', 'aria-hidden': 'true' }, ':'), h('b', { class: winB ? 'w' : undefined }, String(b.gameWins ?? 0))),
        ),
      )
    : h(statusTag, { class: `m-status st-${st.kind}`, ...detail }, st.kind === 'live' ? h('span', { class: 'live-dot', 'aria-hidden': 'true' }) : null, planned ? 'vs' : st.label);
  const games = m.games?.length
    ? h(
        'ol',
        { class: 'm-games', id: `g-${m.id}`, hidden: true },
        ...m.games.map((g) =>
          h(
            'li',
            { class: 'gm' },
            h('span', { class: 'gm-n' }, `Hra ${g.n}`),
            h('span', { class: 'sp-v gm-w' }, g.winnerCode ?? '?'),
            g.durationSec ? h('span', { class: 'gm-d' }, formatDuration(g.durationSec)) : null,
          ),
        ),
        detail ? h('li', { class: 'gm gm--more' }, h('a', { href: detail.href }, 'Detail zápasu', icon('chevron', 'ic ic-s'))) : null,
      )
    : null;
  const expand = m.games?.length
    ? h('button', { class: 'm-expand', type: 'button', 'aria-expanded': 'false', 'aria-controls': `g-${m.id}`, 'data-action': 'expand', title: 'Zobrazit jednotlivé hry' }, `Bo${m.bestOf}`, icon('down', 'ic ic-s'))
    : h('span', { class: 'm-bo' }, `Bo${m.bestOf}`);
  const streamer = o.streamers?.[0];
  return h(
    'div',
    { class: `match${done ? ' is-final' : ''}${st.kind === 'live' ? ' is-live' : ''}`, 'data-spoiler': done ? '1' : undefined, 'data-mid': m.id },
    h(
      'div',
      { class: 'm-main' },
      h('span', { class: 'm-meta' }, when, o.showLeague ? h('span', { class: 'm-league' }, leagueName(m.league)) : null),
      h('div', { class: 'm-vs' }, teamCell(a, winA, 'a'), status, teamCell(b, winB, 'b')),
      expand,
    ),
    streamer && st.kind !== 'final' ? h('a', { class: 'm-czech', href: streamer.url, rel: 'noopener', target: '_blank' }, `Česky obvykle: ${streamer.name}`, icon('chevron', 'ic ic-s')) : null,
    games,
  );
}

// ---------- řádek přestupu (D24, R8) ----------

export function transferRow(t: Transfer, now: Date): VNode {
  const statusLabel = t.status === 'confirmed' ? 'potvrzeno' : t.status === 'rumor' ? 'neoficiální' : 'nepotvrzeno';
  const move =
    t.type === 'role'
      ? `${t.to ?? ''}: ${roleCs(t.role)} → ${roleCs(t.roleTo)}`
      : t.type === 'retire'
        ? `konec kariéry (${t.from ?? '?'})`
        : `${t.from ?? 'bez týmu'} → ${t.to ?? 'bez týmu'}`;
  const player = t.playerSlug ? h('a', { href: `/hrac/${t.playerSlug}/` }, t.player) : t.player;
  return h(
    'li',
    { class: `tr tr--${t.status}`, 'data-l': [t.fromLeague, t.toLeague].filter(Boolean).join(' ') || undefined, 'data-cz': t.czsk ? '1' : undefined, 'data-s': t.status },
    h(
      'div',
      { class: 'tr-l1' },
      h('strong', { class: 'tr-player' }, player),
      flag(t.country ?? t.czsk),
      t.role && t.type !== 'role' ? h('span', { class: 'tr-role' }, roleCs(t.role)) : null,
      h('span', { class: `chip chip--${t.status}` }, statusLabel),
      t.loan ? h('span', { class: 'chip chip--loan' }, 'hostování') : null,
    ),
    h(
      'div',
      { class: 'tr-l2' },
      h('span', { class: 'tr-move' }, move),
      h(
        'span',
        { class: 'tr-src' },
        t.source ? h('a', { href: t.source.url, rel: 'noopener nofollow', target: '_blank' }, t.source.site || 'zdroj') : null,
        h('time', { datetime: t.date }, ` · ${formatRelativeDay(`${t.date}T12:00:00Z`, now)}`),
      ),
    ),
  );
}

export function filterTransfers(list: Transfer[], filter: string): Transfer[] {
  if (filter === 'czsk') return list.filter((t) => t.czsk);
  if (filter === 'all' || !filter) return list;
  return list.filter((t) => t.fromLeague === filter || t.toLeague === filter);
}

// ---------- Češi a Slováci ----------

export function czskRow(p: CzSkPlayer): VNode {
  const name = p.playerSlug ? h('a', { href: `/hrac/${p.playerSlug}/` }, p.handle) : p.handle;
  const team = p.teamSlug ? h('a', { href: `/tym/${p.teamSlug}/` }, p.team) : p.team;
  return h(
    'li',
    { class: 'cz' },
    h('span', { class: 'cz-who' }, h('strong', null, name), flag(p.country), h('span', { class: 'cz-role' }, roleCs(p.role)), p.freeAgent ? h('span', { class: 'chip chip--fa' }, 'volný hráč') : null),
    p.league ? h('span', { class: 'cz-league' }, leagueName(p.league)) : null,
    h('span', { class: 'cz-team' }, !p.team ? 'bez týmu' : p.freeAgent ? ['naposledy ', team] : team),
  );
}

// ---------- tabulka ----------

export function standingsTable(s: Standings, highlight?: string): VNode {
  return h(
    'div',
    { class: 'standings', 'data-spoiler': '1' },
    h(
      'table',
      null,
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, '#'), h('th', { scope: 'col' }, 'Tým'), h('th', { scope: 'col', class: 'wl', 'aria-hidden': 'true' }, ''), h('th', { scope: 'col', class: 'num' }, 'V–P'))),
      h(
        'tbody',
        { class: 'sp-block' },
        ...s.rows.map((r) => {
          const played = r.wins + r.losses;
          const pct = played ? Math.round((r.wins / played) * 100) : 0;
          return h(
            'tr',
            { class: r.slug && r.slug === highlight ? 'is-hl' : undefined },
            h('td', { class: 'num rank' }, h('span', null, String(r.rank))),
            h('th', { scope: 'row' }, r.slug ? h('a', { href: `/tym/${r.slug}/` }, r.name) : r.name),
            h('td', { class: 'wl', 'aria-hidden': 'true' }, h('span', { class: 'wl-bar', style: `--p:${pct}%` })),
            h('td', { class: 'num' }, `${r.wins}–${r.losses}`),
          );
        }),
      ),
    ),
    h('button', { class: 'sp-reveal', type: 'button', 'data-action': 'reveal' }, 'Odkrýt tabulku'),
  );
}

// ---------- pavouk (D22) ----------

export function bracketView(b: Bracket, now: Date): VNode {
  const currentIdx = Math.max(
    0,
    b.rounds.findIndex((r) => r.matches.some((m) => m.state !== 'completed')),
  );
  const active = b.rounds.some((r) => r.matches.some((m) => m.state !== 'completed')) ? currentIdx : b.rounds.length - 1;
  return h(
    'div',
    { class: 'bracket', 'data-bracket': b.tournament },
    h(
      'div',
      { class: 'br-tabs', role: 'tablist', 'aria-label': 'Kola' },
      ...b.rounds.map((r, i) =>
        h('button', { type: 'button', role: 'tab', class: 'br-tab', 'aria-selected': i === active ? 'true' : 'false', 'data-action': 'round', 'data-round': i }, r.name),
      ),
    ),
    h(
      'div',
      { class: 'br-rounds' },
      ...b.rounds.map((r, i) =>
        h(
          'section',
          { class: `br-round${i === active ? ' is-active' : ''}`, 'data-round': i, 'aria-label': r.name },
          h('h3', { class: 'br-name' }, r.name),
          ...r.matches.map((m) => matchRow(m, { now, showDate: true, hideTeamsWhenSpoilers: i > 0 })),
        ),
      ),
    ),
  );
}

// ---------- soupiska ----------

const ROLE_ORDER = ['top', 'jungle', 'mid', 'bottom', 'support', 'none'];

export function rosterList(team: Team): VNode {
  const players = [...team.players].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  return h(
    'ul',
    { class: 'roster' },
    ...players.map((p) =>
      h('li', null, h('span', { class: 'ro-role' }, roleCs(p.role)), h('a', { href: `/hrac/${p.slug}/` }, p.handle), flag(p.country), p.name ? h('span', { class: 'ro-name' }, p.name) : null),
    ),
  );
}

// ---------- soupiska: sestava po pozicích, odhad na další split a přehled pohybů ----------

const ROLE_LABEL: Record<RoleKey, string> = { top: 'Top', jungle: 'Jungle', mid: 'Mid', bottom: 'ADC', support: 'Support', none: 'Další' };

/** Dohledání hráče a týmu v načtených soupiskách (fotka, odkaz, logo). Co načtené není, zůstane jen jako text. */
interface RosterLookup {
  player: (handle: string) => Team['players'][number] | undefined;
  team: (name: string) => Team | undefined;
}

function rosterLookup(teams: Record<string, Team[] | undefined>): RosterLookup {
  const players = new Map<string, Team['players'][number]>();
  const byName = new Map<string, Team>();
  for (const list of Object.values(teams)) {
    for (const t of list ?? []) {
      byName.set(teamKey(t.name), t);
      for (const p of t.players) players.set(p.handle.toLowerCase(), p);
    }
  }
  return { player: (handle) => players.get(handle.toLowerCase()), team: (name) => byName.get(teamKey(name)) };
}

/** Odkaz na tým s logem; tým mimo sledované ligy jen jménem. */
function teamRef(name: string, look: RosterLookup, short = false): VNode {
  const t = look.team(name);
  if (!t) return h('span', { class: 'tref' }, name);
  return h('a', { class: 'tref', href: `/tym/${t.slug}/`, title: t.name }, coin(t.image), short ? t.code : t.name);
}

interface LineupPlayer {
  handle: string;
  slug?: string;
  country?: string;
  image?: string;
  name?: string;
  status?: SlotStatus;
  teams?: string[];
}

const arrow = (dir: 'out' | 'in') => h('span', { class: `mv-arrow mv-arrow--${dir}`, 'aria-hidden': 'true' }, dir === 'out' ? '→' : '←');

const ROLE_ICON: Record<RoleKey, IconName> = { top: 'roleTop', jungle: 'roleJungle', mid: 'roleMid', bottom: 'roleBot', support: 'roleSupport', none: 'user' };

/** Stavový pruh na spodku karty v odhadu. Má ho každá karta (i „zůstává“), aby byly všechny stejně vysoké. */
function statusStrip(p: LineupPlayer, look: RosterLookup): VNode | null {
  const refs = (p.teams ?? []).map((t) => teamRef(t, look, true));
  switch (p.status) {
    case 'stays':
      return h('span', { class: 'lu-strip lu-strip--stays' }, icon('check', 'ic ic-s'), 'zůstává');
    case 'new':
      return h('span', { class: 'lu-strip lu-strip--new' }, 'přichází', arrow('in'), ...refs);
    case 'rumor-in':
      return h('span', { class: 'lu-strip lu-strip--rumor' }, 'možná přijde', arrow('in'), ...refs);
    case 'rumor-out':
      return h('span', { class: 'lu-strip lu-strip--rumor' }, 'možná odejde', arrow('out'), ...refs);
    default:
      return null;
  }
}

/** Karta hráče: fotka přes celou šířku, přezdívka, vlajka, jméno; v odhadu štítek („posila“, „kandidát“) a stavový pruh. */
function lineupCard(p: LineupPlayer, look: RosterLookup, pos: { col: number; row: number }): VNode {
  const known = look.player(p.handle);
  const image = p.image ?? known?.image;
  const slug = p.slug ?? known?.slug;
  const real = p.name ?? known?.name;
  const tag = p.status === 'rumor-in' ? h('span', { class: 'lu-tag' }, 'kandidát') : p.status === 'new' ? h('span', { class: 'lu-tag lu-tag--new' }, 'posila') : null;
  return h(
    'div',
    { class: `lu-card${p.status ? ` lu-card--${p.status}` : ''}`, style: `grid-column:${pos.col};grid-row:${pos.row}` },
    h('span', { class: 'lu-photo' }, image ? h('img', { src: thumbUrl(image, 360), 'data-full': image, alt: '', width: 180, height: 144, decoding: 'async' }) : icon('user', 'ic lu-nophoto'), tag),
    h(
      'span',
      { class: 'lu-id' },
      h('span', { class: 'lu-name' }, slug ? h('a', { href: `/hrac/${slug}/` }, p.handle) : h('span', null, p.handle), flag(p.country ?? known?.country)),
      real ? h('span', { class: 'lu-real', title: real }, real) : null,
    ),
    statusStrip(p, look),
  );
}

/**
 * Sestava po pozicích. Jedna mřížka: sloupec = pozice, řada = pořadí hráče na pozici. Řady mají stejnou výšku,
 * takže karta hráče, který zůstává, je stejně vysoká jako karta toho, kdo možná odejde nebo přijde.
 * V úzkém kontejneru se mřížka vypne a karty jdou pod sebou v pořadí, v jakém jsou tady (pozice, pak její hráči).
 */
function lineupBoard(cols: Array<{ role: RoleKey; state?: string; players: LineupPlayer[] }>, look: RosterLookup): VNode {
  const rows = Math.max(1, ...cols.map((c) => c.players.length));
  const cells: Child[] = [];
  cols.forEach((c, i) => {
    const col = i + 1;
    cells.push(h('span', { class: `lu-role${c.state ? ` lu-role--${c.state}` : ''}`, style: `grid-column:${col};grid-row:1` }, icon(ROLE_ICON[c.role], 'ic ic-s'), ROLE_LABEL[c.role]));
    if (!c.players.length) {
      cells.push(h('div', { class: 'lu-card lu-card--open', style: `grid-column:${col};grid-row:2` }, icon('plus', 'ic lu-plus'), h('span', { class: 'lu-open' }, 'volné místo')));
    }
    c.players.forEach((p, j) => cells.push(lineupCard(p, look, { col, row: j + 2 })));
  });
  return h('div', { class: 'lu', style: `--cols:${cols.length};--rows:${rows}` }, ...cells);
}

/** Řádek přehledu pohybů: hráč, šipka, tým s logem (kam jde / odkud přichází), jistota a zdroj. */
function movementRow(m: Movement, look: RosterLookup): VNode {
  const known = look.player(m.handle);
  const slug = m.slug ?? known?.slug;
  const where: Child[] = m.retired ? ['konec kariéry'] : m.teams.length ? m.teams.map((t) => teamRef(t, look)) : ['bez týmu'];
  return h(
    'li',
    { class: `mv mv--${m.dir} ${m.certain ? 'mv--sure' : 'mv--maybe'}` },
    h('span', { class: 'mv-who' }, slug ? h('a', { href: `/hrac/${slug}/` }, m.handle) : h('span', null, m.handle), flag(m.country ?? known?.country), h('span', { class: 'cz-role' }, ROLE_LABEL[m.role])),
    h('span', { class: 'mv-meta' }, h('span', { class: `chip ${m.certain ? 'chip--confirmed' : 'chip--rumor'}` }, m.certain ? 'potvrzeno' : 'spekulace'), m.source ? h('a', { class: 'proj-src', href: m.source.url, rel: 'noopener nofollow', target: '_blank' }, m.source.site || 'zdroj') : null),
    h(
      'span',
      { class: 'mv-where' },
      h('span', { class: 'sr-only' }, m.dir === 'out' ? 'odchází:' : 'přichází z:'),
      arrow(m.dir),
      ...where,
      m.rumoredTo?.length ? [h('span', { class: 'mv-also' }, 'spekuluje se:'), ...m.rumoredTo.map((t) => teamRef(t, look))] : null,
    ),
  );
}

export function projectionView(p: Projection, look: RosterLookup): VNode {
  const mv = movements(p);
  const summary = [
    h('span', { class: 'chip chip--confirmed' }, `jisté pozice: ${p.counts.set}`),
    p.counts.uncertain ? h('span', { class: 'chip chip--rumor' }, `nejisté: ${p.counts.uncertain}`) : null,
    p.counts.open ? h('span', { class: 'chip chip--open' }, `volné: ${p.counts.open}`) : null,
  ];
  const list = (items: Movement[], empty: string) => (items.length ? h('ul', { class: 'mv-list' }, ...items.map((m) => movementRow(m, look))) : h('p', { class: 'empty' }, empty));
  return h(
    'div',
    { class: 'proj' },
    h('p', { class: 'proj-note' }, p.changed ? 'Odhad z potvrzených změn a neoficiálních zpráv za posledních 45 dní. Není to oficiální soupiska.' : 'Za posledních 45 dní žádná potvrzená změna ani spekulace. Odhad je stejný jako dnešní soupiska.'),
    h('p', { class: 'proj-sum' }, ...summary),
    lineupBoard(
      p.roles.map((r) => ({ role: r.role, state: r.state, players: r.players.map((x) => ({ handle: x.handle, slug: x.slug, country: x.country, status: x.status, teams: x.teams })) })),
      look,
    ),
    h(
      'div',
      { class: 'mv-cols' },
      h('section', { class: 'mv-sec mv-sec--out' }, h('h3', { class: 'grp' }, 'Odchody', h('span', { class: 'h-sub' }, 'kam hráč jde')), list(mv.out, 'Žádný odchod ani spekulace o odchodu.')),
      h('section', { class: 'mv-sec mv-sec--in' }, h('h3', { class: 'grp' }, 'Příchody', h('span', { class: 'h-sub' }, 'kdo může přijít')), list(mv.in, 'Žádný příchod ani spekulace o příchodu.')),
    ),
  );
}

/**
 * Soupiska s přepínačem: dnešní (oficiální) sestava / odhad na další split s přehledem odchodů a příchodů.
 * Přepíná client/common.ts (data-action="roster-tab").
 */
export function rosterSwitch(team: Team, data: Pick<RenderData, 'transfers' | 'teams'>): VNode {
  const look = rosterLookup({ ...data.teams, self: [team] });
  const p = projectRoster(team, data.transfers ?? []);
  const mv = movements(p);
  const changes = mv.out.length + mv.in.length;
  const roles: RoleKey[] = [...MAIN_ROLES, 'none'];
  const current = roles
    .map((role) => ({ role, players: team.players.filter((x) => normalizeRole(x.role) === role).map((x): LineupPlayer => ({ handle: x.handle, slug: x.slug, country: x.country, image: x.image, name: x.name })) }))
    .filter((c) => c.role !== 'none' || c.players.length);
  return h(
    'div',
    { class: 'roster-switch', 'data-roster': team.slug },
    h(
      'div',
      { class: 'seg', role: 'tablist', 'aria-label': 'Soupiska' },
      h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', 'data-action': 'roster-tab', 'data-tab': 'now' }, 'Aktuální'),
      h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', 'data-action': 'roster-tab', 'data-tab': 'next' }, 'Další split · odhad', changes ? h('span', { class: 'seg-badge', title: 'Počet odchodů a příchodů (potvrzených i spekulací)' }, String(changes)) : null),
    ),
    h('div', { 'data-pane': 'now' }, team.players.length ? lineupBoard(current, look) : h('p', { class: 'empty' }, 'Soupiska zatím nezveřejněna.')),
    h('div', { 'data-pane': 'next', hidden: true }, projectionView(p, look)),
  );
}

// ---------- pomocné výběry dat ----------

export function nextMatchOf(teamSlug: string, data: Pick<RenderData, 'upcoming' | 'schedule'>, now: Date): Match | undefined {
  const all = [...(data.upcoming ?? []), ...Object.values(data.schedule).flatMap((x) => x ?? [])];
  return all
    .filter((m) => m.state !== 'completed' && Date.parse(m.startTime) > now.getTime() - 6 * 3_600_000 && m.teams.some((t) => t.slug === teamSlug))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
}

export function lastMatchesOf(teamSlug: string, matches: Match[], n: number): Match[] {
  return matches
    .filter((m) => m.state === 'completed' && m.teams.some((t) => t.slug === teamSlug))
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
    .slice(0, n);
}

export function findTeam(slug: string, teams: Record<string, Team[] | undefined>): Team | undefined {
  for (const list of Object.values(teams)) {
    const t = list?.find((x) => x.slug === slug);
    if (t) return t;
  }
  return undefined;
}

// ---------- dlaždice dashboardu ----------

export const TILE_LABEL: Record<TileConfig['t'], string> = {
  today: 'Dnes',
  results: 'Výsledky',
  standings: 'Tabulka ligy',
  roster: 'Soupiska týmu',
  bracket: 'Mezinárodní turnaj',
  player: 'Sleduj hráče',
  transfers: 'Přestupy',
  czsk: 'Češi a Slováci',
  countdown: 'Odpočet startu ligy',
};

const TILE_SOURCE: Record<TileConfig['t'], SourceKey> = {
  today: 'lolesports',
  results: 'lolesports',
  standings: 'lolesports',
  roster: 'lolesports',
  bracket: 'lolesports',
  player: 'lolesports',
  transfers: 'leaguepedia',
  czsk: 'leaguepedia',
  countdown: 'lolesports',
};

export function tileTitle(t: TileConfig, data: RenderData): string {
  switch (t.t) {
    case 'today':
      return t.p ? `Dnes · ${leagueName(t.p)}` : 'Dnes';
    case 'results':
      return `Výsledky · ${leagueName(t.p ?? '')}`;
    case 'standings':
      return `Tabulka · ${leagueName(t.p ?? '')}`;
    case 'roster':
      return `Soupiska · ${findTeam(t.p ?? '', data.teams)?.name ?? t.p}`;
    case 'bracket':
      return `Pavouk · ${data.brackets[t.p ?? '']?.name ?? t.p}`;
    case 'player':
      return `Hráč · ${data.catalog?.players.find((p) => p.id === t.p)?.label ?? t.p}`;
    case 'transfers':
      return t.p === 'czsk' ? 'Přestupy · Češi a Slováci' : t.p && t.p !== 'all' ? `Přestupy · ${leagueName(t.p)}` : 'Přestupy';
    case 'czsk':
      return 'Češi a Slováci';
    case 'countdown':
      return `Start · ${leagueName(t.p ?? '')}`;
  }
}

function empty(text: string, action?: { href: string; label: string }): VNode {
  return h('p', { class: 'empty' }, text, action ? h('a', { href: action.href, class: 'empty-act' }, ` ${action.label}`, icon('chevron', 'ic ic-s')) : null);
}

function moreLink(href: string, label: string): VNode {
  return h('a', { class: 'tile-more', href }, label, icon('chevron', 'ic ic-s'));
}

export interface TileRenderOpts {
  primary?: boolean;
  index: number;
}

export function renderTile(t: TileConfig, data: RenderData, o: TileRenderOpts): VNode {
  const { now } = data;
  const body = tileBody(t, data);
  return h(
    'section',
    { class: `tile tile--${t.t}${o.primary ? ' tile--primary' : ''}`, 'data-tile': o.index, 'aria-labelledby': `tile-h-${o.index}` },
    h('header', { class: 'tile-head' }, h('h2', { id: `tile-h-${o.index}` }, tileTitle(t, data)), freshness(TILE_SOURCE[t.t], data.meta, now)),
    h('div', { class: 'tile-body' }, body),
  );
}

function tileBody(t: TileConfig, data: RenderData): Child | Child[] {
  const { now } = data;
  switch (t.t) {
    case 'today':
      return todayBody(t.p, data);
    case 'results': {
      const list = (data.schedule[t.p ?? ''] ?? []).filter((m) => m.state === 'completed').sort((a, b) => b.startTime.localeCompare(a.startTime)).slice(0, 6);
      if (!list.length) return empty('V této lize se zatím nehrálo.', { href: '/vysledky/', label: 'Přehled výsledků' });
      return [h('div', { class: 'mlist' }, ...list.map((m) => matchRow(m, { now, showDate: true }))), moreLink(`/vysledky/?l=${leagueShort(t.p ?? '')}`, 'Všechny výsledky')];
    }
    case 'standings': {
      const s = data.standings[t.p ?? ''];
      if (!s || !s.rows.length) return empty('Tabulka bude po prvním kole.');
      return [standingsTable(s), moreLink(`/liga/${leagueShort(t.p ?? '')}/`, `Stránka ${leagueName(t.p ?? '')}`)];
    }
    case 'roster': {
      const team = findTeam(t.p ?? '', data.teams);
      if (!team || !team.players.length) return empty('Soupiska zatím nezveřejněna.');
      return [rosterSwitch(team, data), moreLink(`/tym/${team.slug}/`, `Stránka ${team.code}`)];
    }
    case 'bracket': {
      const b = data.brackets[t.p ?? ''];
      if (!b || !b.rounds.length) return empty('Pavouk se ukáže po skupinové fázi.');
      return bracketView(b, now);
    }
    case 'player':
      return playerBody(t.p ?? '', data);
    case 'transfers': {
      const list = filterTransfers(data.transfers ?? [], t.p ?? 'all').slice(0, 8);
      if (!list.length) {
        const where = t.p === 'czsk' ? 'u Čechů a Slováků' : t.p && t.p !== 'all' ? `v ${leagueName(t.p)}` : '';
        return empty(`Za posledních 14 dní žádné změny ${where}.`.replace(/\s+\./, '.'), { href: '/prestupy/', label: 'Zobrazit všechny ligy' });
      }
      return [h('ul', { class: 'trlist' }, ...list.map((x) => transferRow(x, now))), moreLink('/prestupy/', 'Všechny přestupy')];
    }
    case 'czsk': {
      const list = (data.czsk ?? []).filter((p) => p.league).slice(0, 8);
      if (!list.length) return empty('Žádný Čech ani Slovák teď nehraje ve sledované lize.', { href: '/cesi/', label: 'Všichni hráči' });
      return [h('ul', { class: 'czlist' }, ...list.map(czskRow)), moreLink('/cesi/', `Všech ${(data.czsk ?? []).length} hráčů`)];
    }
    case 'countdown':
      return countdownBody(t.p ?? '', data);
  }
}

export function countdownBody(league: string, data: RenderData): VNode {
  const info = data.leagues.find((l) => l.slug === league);
  const name = leagueName(league);
  if (!info?.nextStart) return h('p', { class: 'cd' }, h('strong', null, name), ' 2027: termín zatím neznámý');
  const d = daysUntil(info.nextStart, data.now);
  if (d <= 0) return h('p', { class: 'cd' }, h('strong', null, name), ' už běží');
  return h('p', { class: 'cd' }, h('strong', null, name), ` startuje za ${pluralDays(d)}`, h('a', { class: 'cd-ics', href: `/ics/liga-${leagueShort(league)}.ics` }, icon('calendar', 'ic ic-s'), ' Do kalendáře'));
}

function groupByLeague(ms: Match[]): Map<string, Match[]> {
  const map = new Map<string, Match[]>();
  for (const m of ms.sort((a, b) => a.startTime.localeCompare(b.startTime))) {
    const list = map.get(m.league) ?? [];
    list.push(m);
    map.set(m.league, list);
  }
  return map;
}

function matchGroups(ms: Match[], data: RenderData, showDate = false): Child[] {
  const out: Child[] = [];
  for (const [league, list] of groupByLeague(ms)) {
    out.push(h('h3', { class: 'grp' }, leagueName(league)));
    out.push(h('div', { class: 'mlist' }, ...list.map((m) => matchRow(m, { now: data.now, showDate, streamers: data.streamers[league] }))));
  }
  return out;
}

/** D7 + D9: dnešní zápasy; když se nehraje, nejbližší hrací den, jinak poslední odehrané. */
export function todayBody(league: string | undefined, data: RenderData): Child[] {
  const { now } = data;
  const pool = (data.upcoming ?? []).filter((m) => (league ? m.league === league : SEASON_LEAGUES.includes(m.league) || LEAGUE_BY_SLUG.has(m.league)));
  const today = dayKey(now);
  const todays = pool.filter((m) => dayKey(new Date(m.startTime)) === today);
  if (todays.length) return matchGroups(todays, data);
  const future = pool.filter((m) => Date.parse(m.startTime) > now.getTime()).sort((a, b) => a.startTime.localeCompare(b.startTime));
  if (future.length) {
    const day = dayKey(new Date(future[0].startTime));
    const sameDay = future.filter((m) => dayKey(new Date(m.startTime)) === day);
    return [h('p', { class: 'empty' }, 'Dnes se nehraje.'), h('p', { class: 'next-day' }, `Nejbližší zápasy: ${formatDate(future[0].startTime)}`), ...matchGroups(sameDay, data)];
  }
  const past = pool.filter((m) => m.state === 'completed').sort((a, b) => b.startTime.localeCompare(a.startTime));
  if (past.length) {
    const day = dayKey(new Date(past[0].startTime));
    const sameDay = past.filter((m) => dayKey(new Date(m.startTime)) === day);
    return [
      h('p', { class: 'empty' }, 'Dnes se nehraje. Další zápasy zatím nejsou v rozpisu.'),
      h('p', { class: 'next-day' }, `Naposledy se hrálo: ${formatRelativeDay(past[0].startTime, now)}`),
      ...matchGroups(sameDay, data, false),
    ];
  }
  return [h('p', { class: 'empty' }, 'Dnes se nehraje. Další zápasy zatím nejsou v rozpisu.')];
}

function playerBody(slug: string, data: RenderData): Child[] {
  let team: Team | undefined;
  let player: Team['players'][number] | undefined;
  for (const list of Object.values(data.teams)) {
    for (const t of list ?? []) {
      const p = t.players.find((x) => x.slug === slug);
      if (p) {
        team = t;
        player = p;
      }
    }
  }
  if (!player || !team) return [empty('Hráč je teď bez týmu.')];
  const next = nextMatchOf(team.slug, data, data.now);
  const last = lastMatchesOf(team.slug, data.schedule[team.league] ?? [], 1)[0];
  return [
    h('p', { class: 'pl-id' }, h('a', { href: `/hrac/${player.slug}/` }, h('strong', null, player.handle)), flag(player.country), ` · ${roleCs(player.role)} · `, h('a', { href: `/tym/${team.slug}/` }, team.name)),
    next ? h('div', { class: 'mlist' }, matchRow(next, { now: data.now, showDate: true, streamers: data.streamers[next.league] })) : h('p', { class: 'empty' }, 'Další zápas zatím není v rozpisu.'),
    last ? h('div', { class: 'mlist' }, matchRow(last, { now: data.now, showDate: true })) : null,
  ];
}

// ---------- výchozí dashboard (D4, D12) ----------

export function defaultTiles(data: Pick<RenderData, 'upcoming' | 'now'>): TileConfig[] {
  if (isInSeason(data.upcoming ?? [], data.now)) {
    return [{ t: 'today' }, { t: 'transfers', p: 'all' }, { t: 'czsk' }, { t: 'standings', p: 'lec' }];
  }
  return [{ t: 'countdown', p: 'lec' }, { t: 'czsk' }, { t: 'transfers', p: 'all' }, { t: 'results', p: 'lec' }];
}

/** První dlaždice (kromě odpočtu) je hlavní plocha; odpočet se kreslí jako proužek nad ní. */
export function renderDashboard(tiles: TileConfig[], data: RenderData): VNode[] {
  const out: VNode[] = [];
  let primaryDone = false;
  tiles.forEach((t, i) => {
    if (t.t === 'countdown') {
      out.push(h('div', { class: 'strip', 'data-tile': i }, countdownBody(t.p ?? '', data)));
      return;
    }
    out.push(renderTile(t, data, { index: i, primary: !primaryDone }));
    primaryDone = true;
  });
  return out;
}
