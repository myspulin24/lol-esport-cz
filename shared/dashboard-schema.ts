// Schéma konfigurace dashboardu v1 (R3/D8): vstup z #d= nebo localStorage je nedůvěryhodný.
// Povolené jsou jen známé typy dlaždic a ID ze skutečných dat; neznámé položky se zahodí.

import type { Catalog } from './types';

export const TILE_TYPES = ['today', 'results', 'standings', 'roster', 'bracket', 'player', 'transfers', 'czsk', 'countdown'] as const;
export type TileType = (typeof TILE_TYPES)[number];

export interface TileConfig {
  t: TileType;
  /** parametr: liga / tým / hráč / turnaj / filtr přestupů */
  p?: string;
}

export interface DashboardConfig {
  v: 1;
  tiles: TileConfig[];
}

export const MAX_CONFIG_BYTES = 2048;
export const MAX_TILES = 16;

/** Jaký parametr který typ dlaždice potřebuje. */
export const TILE_PARAM: Record<TileType, 'league' | 'team' | 'player' | 'tournament' | 'transfers' | 'none' | 'league-optional'> = {
  today: 'league-optional',
  results: 'league',
  standings: 'league',
  roster: 'team',
  bracket: 'tournament',
  player: 'player',
  transfers: 'transfers',
  czsk: 'none',
  countdown: 'league',
};

export interface ValidationResult {
  config: DashboardConfig;
  dropped: number;
  invalid: boolean;
}

function known(catalog: Catalog) {
  return {
    league: new Set(catalog.leagues.map((x) => x.id)),
    team: new Set(catalog.teams.map((x) => x.id)),
    player: new Set(catalog.players.map((x) => x.id)),
    tournament: new Set(catalog.tournaments.map((x) => x.id)),
  };
}

export function validateConfig(raw: unknown, catalog: Catalog): ValidationResult {
  const empty: DashboardConfig = { v: 1, tiles: [] };
  if (!raw || typeof raw !== 'object') return { config: empty, dropped: 0, invalid: true };
  const obj = raw as { v?: unknown; tiles?: unknown };
  if (obj.v !== 1 || !Array.isArray(obj.tiles)) return { config: empty, dropped: 0, invalid: true };
  const k = known(catalog);
  const tiles: TileConfig[] = [];
  let dropped = 0;
  for (const item of obj.tiles.slice(0, MAX_TILES)) {
    if (!item || typeof item !== 'object') {
      dropped++;
      continue;
    }
    const t = (item as { t?: unknown }).t;
    const p = (item as { p?: unknown }).p;
    if (typeof t !== 'string' || !(TILE_TYPES as readonly string[]).includes(t)) {
      dropped++;
      continue;
    }
    const type = t as TileType;
    const need = TILE_PARAM[type];
    if (need === 'none') {
      tiles.push({ t: type });
      continue;
    }
    if (need === 'league-optional') {
      if (p === undefined || p === null || p === '') tiles.push({ t: type });
      else if (typeof p === 'string' && k.league.has(p)) tiles.push({ t: type, p });
      else dropped++;
      continue;
    }
    if (typeof p !== 'string') {
      dropped++;
      continue;
    }
    const ok =
      need === 'league'
        ? k.league.has(p)
        : need === 'team'
          ? k.team.has(p)
          : need === 'player'
            ? k.player.has(p)
            : need === 'tournament'
              ? k.tournament.has(p)
              : need === 'transfers'
                ? p === 'all' || p === 'czsk' || k.league.has(p)
                : false;
    if (ok) tiles.push({ t: type, p });
    else dropped++;
  }
  dropped += Math.max(0, obj.tiles.length - MAX_TILES);
  return { config: { v: 1, tiles }, dropped, invalid: false };
}

// --- kódování do #d= (base64url kompaktního JSON) ---

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeConfig(config: DashboardConfig): string {
  return toBase64Url(JSON.stringify(config));
}

/** Vrátí rozbalený objekt nebo null (poškozené, příliš velké). Validaci dělá validateConfig. */
export function decodeConfig(encoded: string): unknown | null {
  if (!encoded || encoded.length > Math.ceil((MAX_CONFIG_BYTES * 4) / 3) + 4) return null;
  try {
    const json = fromBase64Url(encoded);
    if (new TextEncoder().encode(json).length > MAX_CONFIG_BYTES) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}
