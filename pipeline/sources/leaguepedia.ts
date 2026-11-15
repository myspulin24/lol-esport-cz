// Zdroj: Leaguepedia (lol.fandom.com) přes Cargo API. Data jsou pod licencí CC BY-SA
// (verzi ověř v patičce Leaguepedie). Přebíráme jen strukturovaná fakta, žádný text.
// R7/D12: stahuje se jen jednou za hodinu, s vlastním User-Agentem.

import { fetchJson, SOURCE_BUDGET_MS } from '../http';
import { plainText, safeUrl } from '../../shared/safe-url';
import { sleep, ymd } from '../util';
import { countryCode } from '../countries';

const API = 'https://lol.fandom.com/api.php';
const USER_AGENT = 'lol-esport-cz/0.1 (unofficial Czech LoL esports fan site; static, hourly)';
const PAGE = 500;
const REQUEST_GAP_MS = 2_500;
const RATE_LIMIT_WAIT_MS = 45_000;

/** Výsledky her jen pro sledované soutěže (méně dotazů na Leaguepedii). */
const GAME_PAGES = [
  "OverviewPage LIKE 'LCK/%'",
  "OverviewPage LIKE 'LPL/%'",
  "OverviewPage LIKE 'LEC/%'",
  "OverviewPage LIKE 'LCS/%'",
  "OverviewPage LIKE 'CBLOL/%'",
  "OverviewPage LIKE 'LCP/%'",
  "OverviewPage LIKE 'Hitpoint Masters/%'",
  "OverviewPage LIKE '%World Championship%'",
  "OverviewPage LIKE '%Mid-Season Invitational%'",
  "OverviewPage LIKE '%First Stand%'",
].join(' OR ');

export interface RosterChangeRow {
  date: string; // YYYY-MM-DD
  player: string;
  direction: 'Join' | 'Leave';
  team: string;
  role: string;
  rolesIngame: string;
  rolesStaff: string;
  roleModifier: string;
  status: string;
  sourceUrl?: string;
  sourceSite?: string;
  newsId?: string;
  /** kód státu hráče (z tabulky Players) */
  country?: string;
}

export interface RumorRow {
  date: string;
  player: string;
  teamStart: string;
  teamEnd: string;
  roleStart: string;
  roleEnd: string;
  isOver: boolean;
  notHappening: boolean;
  sourceUrl?: string;
  sourceSite?: string;
  country?: string;
}

export interface CzSkRow {
  handle: string;
  name: string;
  country: 'CZ' | 'SK';
  team: string;
  role: string;
}

export interface GameRow {
  team1: string;
  team2: string;
  winTeam: string;
  durationSec?: number;
  dateTimeUtc: string; // ISO
  n: number;
  matchId: string;
  patch?: string;
  vod?: string;
  /** [modrá strana = Team1, červená = Team2]; chybí u starších řádků v cache */
  sides?: [GameRowSide, GameRowSide];
}

export interface GameRowSide {
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

/** Řádek tabulky Players pro přezdívku ze soupisky (jmenovců může být víc, rozliší se týmem). */
export interface PlayerRow {
  id: string;
  country?: string;
  team: string;
  retired: boolean;
}

export interface LeaguepediaData {
  changes: RosterChangeRow[];
  rumors: RumorRow[];
  czsk: CzSkRow[];
  games: GameRow[];
  /** státy hráčů ze soupisek: které přezdívky se v tomto běhu stihly dotázat a co se vrátilo */
  players?: { queried: string[]; rows: PlayerRow[] };
}

export interface LeaguepediaOptions {
  /** přezdívky hráčů ze soupisek, u kterých ještě neznáme stát */
  playerIds?: string[];
}

const PLAYER_ID_CHUNK = 40;
const PLAYER_ID_MAX_CHUNKS = 6; // 240 přezdívek za běh; zbytek se doptá v dalších hodinách (šetří limit wiki i čas běhu)
const SAFE_ID = /^[\p{L}\p{N} ._-]{1,40}$/u;

type CargoRow = Record<string, string>;

export async function fetchLeaguepedia(now: Date, fetchImpl?: typeof fetch, opts: LeaguepediaOptions = {}): Promise<LeaguepediaData> {
  const deadline = Date.now() + SOURCE_BUDGET_MS;
  const pause = (ms: number) => (fetchImpl ? Promise.resolve() : sleep(ms));
  async function cargo(params: Record<string, string>, maxRows = PAGE): Promise<CargoRow[]> {
    const out: CargoRow[] = [];
    for (let offset = 0; offset < maxRows; offset += PAGE) {
      const qs = new URLSearchParams({ action: 'cargoquery', format: 'json', limit: String(PAGE), offset: String(offset), ...params });
      let res: { cargoquery?: Array<{ title: CargoRow }>; error?: { code?: string; info?: string } } | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        res = await fetchJson(`${API}?${qs}`, { headers: { 'User-Agent': USER_AGENT }, deadline, fetchImpl });
        const limited = res?.error && /rate ?limit/i.test(`${res.error.code} ${res.error.info}`);
        if (!limited || attempt === 1 || Date.now() + RATE_LIMIT_WAIT_MS > deadline) break;
        await pause(RATE_LIMIT_WAIT_MS); // jednou počkat a zkusit znovu
      }
      if (res?.error) throw new Error(`Leaguepedia: ${res.error.info ?? 'chyba dotazu'}`);
      const rows = (res?.cargoquery ?? []).map((r) => r.title);
      out.push(...rows);
      await pause(REQUEST_GAP_MS); // šetrně ke komunitní wiki
      if (rows.length < PAGE) break;
    }
    return out;
  }

  const since45 = ymd(new Date(now.getTime() - 45 * 86_400_000));
  const since75 = ymd(new Date(now.getTime() - 75 * 86_400_000));

  const changesRaw = await cargo({
    // spojení přes PlayerRedirects → Players přidá stát hráče bez dalšího dotazu
    tables: 'RosterChanges=RC,PlayerRedirects=PR,Players=P',
    join_on: 'RC.Player=PR.AllName,PR.OverviewPage=P.OverviewPage',
    fields: 'RC.Date_Sort,RC.Player,RC.Direction,RC.Team,RC.Role,RC.RolesIngame,RC.RolesStaff,RC.RoleModifier,RC.Status,RC.Source,RC.NewsId,P.Country',
    where: `RC.Date_Sort >= '${since45}'`,
    order_by: 'RC.Date_Sort DESC',
  }, 1000);

  const rumorsRaw = await cargo({
    tables: 'RosterRumors=RR,PlayerRedirects=PR,Players=P',
    join_on: 'RR.Player=PR.AllName,PR.OverviewPage=P.OverviewPage',
    fields: 'RR.Date,RR.Status,RR.IsOver,RR.NotHappening,RR.Player,RR.TeamStart,RR.TeamEnd,RR.RoleStart,RR.RoleEnd,RR.SourceLink,RR.SourceSite,P.Country',
    where: `RR.Date >= '${since45}'`,
    order_by: 'RR.Date DESC',
  }, 500);

  const czskRaw = await cargo({
    tables: 'Players',
    fields: 'ID,Name,Country,Team,Role,IsRetired',
    // i bez týmu: v mimosezóně mají hráči po konci smlouvy prázdný tým (Carzzy, Humanoid…)
    where: "Country IN ('Czech Republic','Slovakia','Czechia') AND (IsRetired IS NULL OR IsRetired=0) AND Role IN ('Top','Jungle','Mid','Bot','Support')",
    order_by: 'ID',
  }, 1000);

  const gamesRaw = await cargo({
    tables: 'ScoreboardGames',
    fields:
      'Team1,Team2,WinTeam,Gamelength_Number,DateTime_UTC,N_GameInMatch,MatchId,Patch,VOD,' +
      [1, 2].map((i) => ['Bans', 'Picks', 'Players', 'Kills', 'Gold', 'Towers', 'Dragons', 'Barons', 'RiftHeralds', 'VoidGrubs', 'Inhibitors'].map((f) => `Team${i}${f}`).join(',')).join(','),
    where: `DateTime_UTC >= '${since75}' AND (${GAME_PAGES})`,
    order_by: 'DateTime_UTC DESC',
  }, 1000);

  // Státy hráčů ze soupisek: po 40 přezdívkách, nejvýš 6 dotazů za běh. Selhání (limit wiki, čas) nezahodí zbytek dat;
  // co se nestihlo, dotáže se příští hodinu.
  const ids = [...new Set(opts.playerIds ?? [])].filter((id) => SAFE_ID.test(id)).slice(0, PLAYER_ID_CHUNK * PLAYER_ID_MAX_CHUNKS);
  const players: NonNullable<LeaguepediaData['players']> = { queried: [], rows: [] };
  try {
    for (let i = 0; i < ids.length; i += PLAYER_ID_CHUNK) {
      const chunk = ids.slice(i, i + PLAYER_ID_CHUNK);
      const rows = await cargo({
        tables: 'Players',
        fields: 'ID,Country,Team,IsRetired',
        where: `ID IN (${chunk.map((id) => `'${id}'`).join(',')})`,
      });
      players.queried.push(...chunk);
      players.rows.push(...rows.map((r) => ({ id: plainText(r.ID), country: countryCode(plainText(r.Country)), team: plainText(r.Team), retired: r.IsRetired === '1' })));
    }
  } catch (err) {
    console.warn(`· leaguepedia: státy hráčů jen částečně (${players.queried.length}/${ids.length}): ${(err as Error).message}`);
  }

  return {
    players,
    changes: dedupe(changesRaw.map(toChange).filter((x): x is RosterChangeRow => !!x), (c) => [c.date, c.player, c.direction, c.team, c.role].join('|')),
    rumors: dedupe(rumorsRaw.map(toRumor).filter((x): x is RumorRow => !!x), (r) => [r.date, r.player, r.teamStart, r.teamEnd].join('|')),
    czsk: czskRaw.map((r) => ({
      handle: plainText(r.ID),
      name: plainText(r.Name),
      country: r.Country === 'Slovakia' ? 'SK' : 'CZ',
      team: plainText(r.Team),
      role: plainText(r.Role),
    })),
    games: gamesRaw.map(toGame).filter((x): x is GameRow => !!x),
  };
}

/** Spojení s PlayerRedirects může řádek zdvojit (dvě přesměrování na jednoho hráče): nechá se první výskyt. */
function dedupe<T>(rows: T[], key: (row: T) => string): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = key(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Pole „Source“ má tvar url;;;titulek;;;web;;;…:::url2;;;… → vezmeme první http(s) odkaz. */
export function parseSource(raw: string | undefined): { url?: string; site?: string } {
  if (!raw) return {};
  const first = raw.split(':::')[0] ?? '';
  const [url, , site] = first.split(';;;');
  return { url: safeUrl(url), site: plainText(site) || undefined };
}

function toChange(r: CargoRow): RosterChangeRow | undefined {
  const dir = r.Direction;
  if (dir !== 'Join' && dir !== 'Leave') return undefined;
  const src = parseSource(r.Source);
  return {
    date: (r['Date Sort'] ?? '').slice(0, 10),
    player: plainText(r.Player),
    direction: dir,
    team: plainText(r.Team),
    role: plainText(r.Role),
    rolesIngame: plainText(r.RolesIngame),
    rolesStaff: plainText(r.RolesStaff),
    roleModifier: plainText(r.RoleModifier),
    status: plainText(r.Status),
    sourceUrl: src.url,
    sourceSite: src.site,
    newsId: plainText(r.NewsId) || undefined,
    country: countryCode(plainText(r.Country)),
  };
}

function toRumor(r: CargoRow): RumorRow | undefined {
  if (!r.Player) return undefined;
  return {
    date: (r.Date ?? '').slice(0, 10),
    player: plainText(r.Player),
    teamStart: plainText(r.TeamStart),
    teamEnd: plainText(r.TeamEnd),
    roleStart: plainText(r.RoleStart),
    roleEnd: plainText(r.RoleEnd),
    isOver: r.IsOver === '1',
    notHappening: r.NotHappening === '1',
    sourceUrl: safeUrl(r.SourceLink),
    sourceSite: plainText(r.SourceSite) || undefined,
    country: countryCode(plainText(r.Country)),
  };
}

function toGame(r: CargoRow): GameRow | undefined {
  const dt = r['DateTime UTC'];
  if (!dt || !r.Team1 || !r.Team2) return undefined;
  const minutes = Number(r['Gamelength Number']);
  return {
    team1: plainText(r.Team1),
    team2: plainText(r.Team2),
    winTeam: plainText(r.WinTeam),
    durationSec: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : undefined,
    dateTimeUtc: `${dt.replace(' ', 'T')}Z`,
    n: Number(r['N GameInMatch']) || 1,
    matchId: plainText(r.MatchId),
    patch: plainText(r.Patch) || undefined,
    vod: safeUrl(r.VOD),
    sides: r.Team1Picks || r.Team2Picks ? [toSide(r, 1), toSide(r, 2)] : undefined,
  };
}

function toSide(r: CargoRow, i: 1 | 2): GameRowSide {
  const list = (v: string | undefined) => plainText(v).split(',').map((x) => x.trim()).filter(Boolean);
  const num = (v: string | undefined) => {
    const n = Number(v);
    return v !== undefined && v !== '' && Number.isFinite(n) ? n : undefined;
  };
  return {
    kills: num(r[`Team${i}Kills`]),
    gold: num(r[`Team${i}Gold`]),
    towers: num(r[`Team${i}Towers`]),
    dragons: num(r[`Team${i}Dragons`]),
    barons: num(r[`Team${i}Barons`]),
    heralds: num(r[`Team${i}RiftHeralds`]),
    grubs: num(r[`Team${i}VoidGrubs`]),
    inhibitors: num(r[`Team${i}Inhibitors`]),
    picks: list(r[`Team${i}Picks`]),
    bans: list(r[`Team${i}Bans`]),
    // jmenovci mají na Leaguepedii závorku se jménem: „Bin (Chen Ze-Bin)“ → „Bin“
    players: list(r[`Team${i}Players`]).map((p) => p.replace(/\s*\(.*\)\s*$/, '')),
  };
}
