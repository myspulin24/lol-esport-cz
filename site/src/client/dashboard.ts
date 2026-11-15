// Dashboard: konfigurace (R3), sdílení #d= (R2-2/D14), úpravy (D20), uložení úprav (D13), přechod do sezóny (D12).

import type { Bracket, Catalog, CzSkPlayer, LeagueInfo, Match, Meta, Standings, Team, Transfer } from '../../../shared/types';
import { decodeConfig, encodeConfig, TILE_PARAM, TILE_TYPES, validateConfig, type DashboardConfig, type TileConfig, type TileType } from '../../../shared/dashboard-schema';
import { defaultTiles, renderDashboard, TILE_LABEL, type RenderData, type Streamer } from '../../../shared/render';
import { isInSeason, seasonSwitch } from '../../../shared/season';
import { TRACKED_LEAGUES, leagueShort } from '../../../shared/leagues';
import { h, mount, toDom, type VNode } from '../../../shared/vnode';
import { icon } from '../../../shared/icons';
import { getJson, getMeta } from './data';
import { refreshFreshness, spoilersOn } from './common';
import { introClock } from './fx';
import { track } from './analytics';

const KEY = 'dashboard:v1';
const PREV_KEY = 'dashboard:before-season';
const SAVE_PROMPT_KEY = 'dashboard:save-prompt';

type Mode = 'default' | 'own' | 'shared';

const TILE_HELP: Record<TileType, string> = {
  today: 'Zápasy dne v našem čase',
  results: 'Poslední výsledky ligy',
  standings: 'Pořadí v lize',
  roster: 'Kdo hraje v týmu',
  bracket: 'Play-off First Stand, MSI, Worlds',
  player: 'Tým, role a příští zápas hráče',
  transfers: 'Potvrzené přestupy a drby',
  czsk: 'Čeští a slovenští hráči ve světě',
  countdown: 'Kolik dní zbývá do startu ligy',
};

interface State {
  mode: Mode;
  tiles: TileConfig[];
  hasOwn: boolean;
  editing: boolean;
  catalog: Catalog;
  upcoming: Match[];
}

let st: State;

// ---------- úložiště ----------
function readOwn(): unknown | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeOwn(cfg: DashboardConfig): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
    return true;
  } catch {
    showBar('note', 'Úpravy se v tomto prohlížeči neuloží. Ulož si odkaz přes Sdílet.', []);
    return false;
  }
}

function hashConfig(): string | null {
  const m = location.hash.match(/^#d=([A-Za-z0-9_-]+)$/);
  return m ? m[1] : null;
}

function setHash(tiles: TileConfig[] | null): void {
  const url = new URL(location.href);
  url.hash = tiles ? `d=${encodeConfig({ v: 1, tiles })}` : '';
  history.replaceState(null, '', url.toString().replace(/#$/, ''));
}

// ---------- data pro vykreslení ----------
async function renderData(tiles: TileConfig[]): Promise<RenderData> {
  const [meta, leagues, catalog, upcoming, streamers] = await Promise.all([
    getMeta().catch(() => undefined as Meta | undefined),
    getJson<LeagueInfo[]>('leagues.json').catch(() => [] as LeagueInfo[]),
    getJson<Catalog>('catalog.json'),
    getJson<Match[]>('upcoming.json').catch(() => [] as Match[]),
    getJson<Record<string, Streamer[]>>('streamers.json').catch(() => ({})),
  ]);
  const data: RenderData = { now: new Date(), meta, leagues, catalog, upcoming, schedule: {}, standings: {}, teams: {}, brackets: {}, streamers };
  const need = new Set<string>();
  for (const t of tiles) {
    const leagueOfTeam = (slug?: string) => catalog.teams.find((x) => x.id === slug)?.league;
    const leagueOfPlayer = (slug?: string) => catalog.players.find((x) => x.id === slug)?.league;
    switch (t.t) {
      case 'results':
        need.add(`schedule:${t.p}`);
        break;
      case 'standings':
        need.add(`standings:${t.p}`);
        break;
      case 'roster':
        need.add(`teams:${leagueOfTeam(t.p)}`);
        need.add('transfers'); // odhad soupisky na další split
        break;
      case 'player': {
        const l = leagueOfPlayer(t.p);
        need.add(`teams:${l}`);
        need.add(`schedule:${l}`);
        break;
      }
      case 'bracket':
        need.add(`bracket:${t.p}`);
        break;
      case 'transfers':
        need.add('transfers');
        break;
      case 'czsk':
        need.add('czsk');
        break;
    }
  }
  await Promise.all(
    [...need].map(async (n) => {
      const [kind, id] = n.split(':');
      try {
        if (kind === 'schedule' && id) data.schedule[id] = await getJson<Match[]>(`schedule/${leagueShort(id)}.json`);
        if (kind === 'standings' && id) data.standings[id] = await getJson<Standings | null>(`standings/${leagueShort(id)}.json`);
        if (kind === 'teams' && id) data.teams[id] = await getJson<Team[]>(`teams/${leagueShort(id)}.json`);
        if (kind === 'bracket' && id) data.brackets[id] = await getJson<Bracket>(`brackets/${id}.json`);
        if (kind === 'transfers') data.transfers = await getJson<Transfer[]>('transfers.json');
        if (kind === 'czsk') data.czsk = await getJson<CzSkPlayer[]>('czsk.json');
      } catch {
        /* chybějící soubor → dlaždice ukáže prázdný/chybový stav */
      }
    }),
  );
  return data;
}

// ---------- lišty ----------
type BarKind = 'shared' | 'save' | 'note';
function showBar(kind: BarKind, text: string, actions: Array<{ label: string; action: string; primary?: boolean }>, closable = true): void {
  const bar = document.querySelector<HTMLElement>(`[data-bar="${kind}"]`);
  if (!bar) return;
  mount(bar, [
    h('span', { class: 'bar-text' }, text),
    ...actions.map((a) => h('button', { type: 'button', class: `btn btn--sm${a.primary ? ' btn--primary' : ''}`, 'data-action': a.action }, a.label)),
    closable ? h('button', { type: 'button', class: 'tool bar-close', 'data-action': `close-${kind}`, 'aria-label': 'Zavřít' }, icon('close')) : null,
  ]);
  bar.hidden = false;
}

function hideBar(kind: BarKind): void {
  const bar = document.querySelector<HTMLElement>(`[data-bar="${kind}"]`);
  if (bar) bar.hidden = true;
}

function toast(text: string, action?: { label: string; run: () => void }, ms = 4000): void {
  document.querySelector('.toast')?.remove();
  const el = toDom(h('div', { class: 'toast', role: 'status' }, h('span', null, text), action ? h('button', { type: 'button' }, action.label) : null)) as HTMLElement;
  document.body.appendChild(el);
  const btn = el.querySelector('button');
  if (btn && action) btn.addEventListener('click', () => {
    action.run();
    el.remove();
  });
  setTimeout(() => el.remove(), ms);
}

function inAppBrowser(): boolean {
  return /(Twitch|Discord|FBAN|FBAV|Instagram|Line\/|; wv\))/i.test(navigator.userAgent);
}

// ---------- vykreslení ----------
async function render(): Promise<void> {
  const el = document.querySelector<HTMLElement>('[data-dash]');
  if (!el) return;
  const data = await renderData(st.tiles);
  const nodes = renderDashboard(st.tiles, data);
  if (st.editing) {
    nodes.forEach((n) => n.children.unshift(editControls(n, data)));
  }
  introClock(el);
  mount(el, nodes);
  el.setAttribute('data-ready', '');
  el.classList.toggle('is-editing', st.editing);
  if (!st.tiles.length) mount(el, h('p', { class: 'empty' }, 'Dashboard je prázdný. ', h('button', { type: 'button', class: 'btn btn--sm', 'data-action': 'catalog' }, icon('plus'), 'Přidat dlaždici')));
  document.querySelector('[data-action="edit"]')?.setAttribute('aria-pressed', String(st.editing));
  const editLbl = document.querySelector('[data-edit-label]');
  if (editLbl) editLbl.textContent = st.editing ? 'Hotovo' : 'Upravit dashboard';
  const tools = document.querySelector<HTMLElement>('[data-edit-tools]');
  if (tools) tools.hidden = !st.editing;
  void refreshFreshness(data.meta);
  if (spoilersOn()) document.querySelector('[data-action="spoilers"]')?.setAttribute('aria-pressed', 'true');
}

function editControls(n: VNode, data: RenderData): VNode {
  const i = Number(n.attrs['data-tile']);
  const t = st.tiles[i];
  return h(
    'div',
    { class: 'edit-ctl' },
    h('span', { class: 'lbl-type' }, TILE_LABEL[t.t]),
    paramPicker(t, i, data.catalog!),
    h('button', { type: 'button', class: 'btn btn--sm', 'data-action': 'tile-up', 'data-i': i, disabled: i === 0, 'aria-label': `Posunout ${TILE_LABEL[t.t]} nahoru` }, icon('up'), 'Nahoru'),
    h('button', { type: 'button', class: 'btn btn--sm', 'data-action': 'tile-down', 'data-i': i, disabled: i === st.tiles.length - 1, 'aria-label': `Posunout ${TILE_LABEL[t.t]} dolů` }, icon('down'), 'Dolů'),
    h('button', { type: 'button', class: 'btn btn--sm', 'data-action': 'tile-remove', 'data-i': i }, icon('close'), 'Odebrat'),
  );
}

function leagueOptions(selected?: string, extra: Array<{ v: string; l: string }> = []): VNode[] {
  return [
    ...extra.map((o) => h('option', { value: o.v, selected: selected === o.v || (!selected && o.v === '') }, o.l)),
    ...TRACKED_LEAGUES.map((l) => h('option', { value: l.slug, selected: selected === l.slug }, l.name)),
  ];
}

function paramPicker(t: TileConfig, i: number, cat: Catalog): VNode | null {
  const need = TILE_PARAM[t.t];
  const id = `p-${i}`;
  const label = (text: string) => h('label', { class: 'sr-only', for: id }, text);
  if (need === 'none') return null;
  if (need === 'league' || need === 'league-optional') {
    return h('span', null, label('Liga'), h('select', { id, 'data-action': 'tile-param', 'data-i': i }, ...leagueOptions(t.p, need === 'league-optional' ? [{ v: '', l: 'Všechny soutěže' }] : [])));
  }
  if (need === 'transfers') {
    return h('span', null, label('Filtr přestupů'), h('select', { id, 'data-action': 'tile-param', 'data-i': i }, ...leagueOptions(t.p, [{ v: 'all', l: 'Všechny ligy' }, { v: 'czsk', l: 'Jen Češi a Slováci' }])));
  }
  if (need === 'tournament') {
    return h('span', null, label('Turnaj'), h('select', { id, 'data-action': 'tile-param', 'data-i': i }, ...cat.tournaments.map((x) => h('option', { value: x.id, selected: x.id === t.p }, x.label))));
  }
  // tým / hráč: vyhledávání se seskupením podle ligy (D20)
  const list = need === 'team' ? cat.teams : cat.players;
  const current = list.find((x) => x.id === t.p);
  const show = (x: Catalog['teams'][number]) => (need === 'team' ? `${x.label} — ${x.group}` : `${x.label} (${x.group}) — ${TRACKED_LEAGUES.find((l) => l.slug === x.league)?.name ?? ''}`);
  return h(
    'span',
    null,
    label(need === 'team' ? 'Hledat tým' : 'Hledat hráče'),
    h('input', { id, type: 'search', list: `${id}-list`, value: current ? show(current) : '', placeholder: need === 'team' ? 'Hledat tým' : 'Hledat hráče', 'data-action': 'tile-param-search', 'data-i': i, 'data-kind': need, autocomplete: 'off' }),
    h('datalist', { id: `${id}-list` }, ...[...list].sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || a.label.localeCompare(b.label)).map((x) => h('option', { value: show(x) }))),
  );
}

// ---------- úpravy ----------
function commit(tiles: TileConfig[]): void {
  st.tiles = tiles;
  if (st.mode === 'shared') {
    setHash(tiles); // úpravy sdíleného dashboardu jsou dočasné (R2-2)
  } else {
    if (writeOwn({ v: 1, tiles })) {
      st.mode = 'own';
      st.hasOwn = true;
    }
  }
  track('dashboard-upraven');
  maybeSavePrompt();
  void render();
}

function maybeSavePrompt(): void {
  try {
    if (localStorage.getItem(SAVE_PROMPT_KEY)) return;
    localStorage.setItem(SAVE_PROMPT_KEY, '1');
  } catch {
    return;
  }
  const text = inAppBrowser()
    ? 'Ulož si svůj dashboard. Otevři web v běžném prohlížeči, ať se úpravy pamatují, nebo si zkopíruj odkaz.'
    : 'Ulož si svůj dashboard: zkopíruj odkaz, nebo v nabídce prohlížeče zvol „Přidat na plochu“.';
  showBar('save', text, [{ label: 'Kopírovat odkaz', action: 'share', primary: true }]);
}

function defaultParam(t: TileType): string | undefined {
  const cat = st.catalog;
  switch (TILE_PARAM[t]) {
    case 'league':
      return 'lec';
    case 'team':
      return cat.teams.find((x) => x.league === 'lec')?.id ?? cat.teams[0]?.id;
    case 'player':
      return cat.players.find((x) => x.league === 'lec')?.id ?? cat.players[0]?.id;
    case 'tournament':
      return cat.tournaments.at(-1)?.id;
    case 'transfers':
      return 'all';
    default:
      return undefined;
  }
}

async function share(): Promise<void> {
  const url = new URL(location.href);
  url.hash = `d=${encodeConfig({ v: 1, tiles: st.tiles })}`;
  try {
    await navigator.clipboard.writeText(url.toString());
    toast('Odkaz na dashboard zkopírován.');
  } catch {
    prompt('Zkopíruj odkaz na svůj dashboard:', url.toString());
  }
  track('sdileni');
}

function openCatalog(open: boolean): void {
  const cat = document.querySelector<HTMLElement>('[data-catalog]');
  if (!cat) return;
  if (open) {
    mount(cat, [
      h('div', { class: 'tile-head' }, h('h2', null, 'Přidat dlaždici'), h('button', { type: 'button', class: 'tool', 'data-action': 'catalog-close', 'aria-label': 'Zavřít katalog' }, icon('close'))),
      h(
        'ul',
        null,
        ...TILE_TYPES.map((t) => h('li', null, h('div', null, h('strong', null, TILE_LABEL[t]), h('p', null, TILE_HELP[t])), h('button', { type: 'button', class: 'btn btn--sm', 'data-action': 'add', 'data-type': t }, icon('plus'), 'Přidat'))),
      ),
    ]);
  }
  cat.hidden = !open;
  if (open) cat.querySelector<HTMLElement>('button')?.focus();
}

function onClick(e: Event): void {
  const t = (e.target as Element).closest<HTMLElement>('[data-action]');
  if (!t) return;
  const a = t.dataset.action;
  const i = Number(t.dataset.i);
  switch (a) {
    case 'edit':
      st.editing = !st.editing;
      if (!st.editing) openCatalog(false);
      void render();
      break;
    case 'share':
      void share();
      break;
    case 'catalog':
      openCatalog(true);
      break;
    case 'catalog-close':
      openCatalog(false);
      break;
    case 'add': {
      const type = t.dataset.type as TileType;
      const p = defaultParam(type);
      commit([...st.tiles, p ? { t: type, p } : { t: type }]);
      toast(`Přidáno: ${TILE_LABEL[type]}`);
      break;
    }
    case 'tile-up':
    case 'tile-down': {
      const j = a === 'tile-up' ? i - 1 : i + 1;
      if (j < 0 || j >= st.tiles.length) return;
      const next = [...st.tiles];
      [next[i], next[j]] = [next[j], next[i]];
      commit(next);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-action="${a}"][data-i="${j}"]`)?.focus());
      break;
    }
    case 'tile-remove': {
      const removed = st.tiles[i];
      commit(st.tiles.filter((_, k) => k !== i));
      toast(`Odebráno: ${TILE_LABEL[removed.t]}`, { label: 'Vrátit', run: () => commit([...st.tiles.slice(0, i), removed, ...st.tiles.slice(i)]) }, 10_000);
      break;
    }
    case 'reset': {
      const before = st.tiles;
      commit(defaultTiles({ upcoming: st.upcoming, now: new Date() }));
      toast('Obnoven výchozí dashboard.', { label: 'Vrátit', run: () => commit(before) }, 10_000);
      break;
    }
    case 'save-shared': {
      if (st.hasOwn && !confirm('Nahradit můj dashboard tímto?')) return;
      writeOwn({ v: 1, tiles: st.tiles });
      setHash(null);
      st.mode = 'own';
      st.hasOwn = true;
      hideBar('shared');
      toast('Uloženo jako tvůj dashboard.');
      void render();
      break;
    }
    case 'back-own':
    case 'show-default': {
      setHash(null);
      hideBar('shared');
      void boot();
      break;
    }
    case 'season-undo': {
      try {
        const prev = localStorage.getItem(PREV_KEY);
        if (prev) {
          localStorage.setItem(KEY, prev);
          localStorage.removeItem(PREV_KEY);
        }
      } catch {
        /* nic */
      }
      hideBar('note');
      void boot();
      break;
    }
    case 'close-shared':
    case 'close-save':
    case 'close-note':
      hideBar(a.replace('close-', '') as BarKind);
      break;
  }
}

function onChange(e: Event): void {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  const a = el.dataset.action;
  const i = Number(el.dataset.i);
  if (a === 'tile-param') {
    const next = [...st.tiles];
    next[i] = el.value ? { t: next[i].t, p: el.value } : { t: next[i].t };
    commit(next);
  }
  if (a === 'tile-param-search') {
    const kind = el.dataset.kind;
    const list = kind === 'team' ? st.catalog.teams : st.catalog.players;
    const hit = list.find((x) => {
      const show = kind === 'team' ? `${x.label} — ${x.group}` : `${x.label} (${x.group}) — ${TRACKED_LEAGUES.find((l) => l.slug === x.league)?.name ?? ''}`;
      return show.toLowerCase() === el.value.trim().toLowerCase();
    });
    if (hit) {
      const next = [...st.tiles];
      next[i] = { t: next[i].t, p: hit.id };
      commit(next);
    }
  }
}

// ---------- start ----------
async function boot(): Promise<void> {
  const [catalog, upcoming] = await Promise.all([getJson<Catalog>('catalog.json'), getJson<Match[]>('upcoming.json').catch(() => [] as Match[])]);
  const now = new Date();
  const ownRaw = readOwn();
  const own = ownRaw ? validateConfig(ownRaw, catalog) : null;
  st = { mode: 'default', tiles: defaultTiles({ upcoming, now }), hasOwn: !!own && !own.invalid, editing: st?.editing ?? false, catalog, upcoming };

  // D6: „Přidat na můj dashboard“ ze stránky ligy/týmu/hráče/turnaje (?add=typ:parametr)
  const add = new URLSearchParams(location.search).get('add');
  if (add) {
    const [type, ...rest] = add.split(':');
    const p = rest.join(':') || undefined;
    const res = validateConfig({ v: 1, tiles: [p ? { t: type, p } : { t: type }] }, catalog);
    const url = new URL(location.href);
    url.searchParams.delete('add');
    history.replaceState(null, '', url.toString());
    if (!res.invalid && res.config.tiles.length) {
      const base = own && !own.invalid ? own.config.tiles : st.tiles;
      const exists = base.some((t) => t.t === res.config.tiles[0].t && t.p === res.config.tiles[0].p);
      const tiles = exists ? base : [...base, res.config.tiles[0]];
      if (writeOwn({ v: 1, tiles })) {
        st.hasOwn = true;
        toast(exists ? 'Tato dlaždice už na dashboardu je.' : `Přidáno na tvůj dashboard: ${TILE_LABEL[res.config.tiles[0].t]}`);
        track('dashboard-upraven');
        maybeSavePrompt();
      }
      st.mode = 'own';
      st.tiles = tiles;
      await render();
      document.querySelector(`[data-tile="${tiles.length - 1}"]`)?.scrollIntoView({ block: 'center' });
      return;
    }
  }

  const enc = hashConfig();
  if (enc) {
    const res = validateConfig(decodeConfig(enc), catalog);
    if (res.invalid) {
      setHash(null);
      showBar('note', 'Odkaz je poškozený nebo zastaralý, zobrazujeme výchozí dashboard.', []);
    } else {
      st.mode = 'shared';
      st.tiles = res.config.tiles;
      const actions = st.hasOwn
        ? [{ label: 'Uložit jako můj', action: 'save-shared', primary: true }, { label: 'Zpět na můj', action: 'back-own' }]
        : [{ label: 'Uložit jako můj', action: 'save-shared', primary: true }, { label: 'Zobrazit výchozí', action: 'show-default' }];
      showBar('shared', st.hasOwn ? 'Díváš se na sdílený dashboard.' : 'Díváš se na dashboard od kamaráda.', actions);
      if (res.dropped) toast(`${res.dropped} ${res.dropped === 1 ? 'položku' : 'položek'} z odkazu jsme vynechali (už neexistuje).`);
    }
  } else if (own && !own.invalid) {
    st.mode = 'own';
    st.tiles = own.config.tiles;
    if (own.dropped) {
      writeOwn(own.config);
      toast(`${own.dropped} ${own.dropped === 1 ? 'dlaždici' : 'dlaždic'} jsme odebrali (tým nebo hráč už neexistuje).`);
    }
    if (isInSeason(upcoming, now)) {
      const sw = seasonSwitch(st.tiles, upcoming, now);
      if (sw.leagues.length) {
        try {
          localStorage.setItem(PREV_KEY, JSON.stringify({ v: 1, tiles: st.tiles }));
        } catch {
          /* nic */
        }
        st.tiles = sw.tiles as TileConfig[];
        writeOwn({ v: 1, tiles: st.tiles });
        showBar('note', 'Sezóna začala: odpočet jsme nahradili dlaždicí Dnes.', [{ label: 'Vrátit', action: 'season-undo' }]);
      }
    }
  }
  await render();
}

export function initDashboard(): void {
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  window.addEventListener('hashchange', () => void boot());
  void boot();
}

