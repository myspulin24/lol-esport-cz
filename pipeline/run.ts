// Řízení běhu pipeline: stáhne zdroje (každý zvlášť, selhání jednoho nezastaví běh),
// uloží normalizovaná data do cache/ (poslední platná data) a vygeneruje site/public/data/*.json.
// Spuštění: `npm run data`  (FORCE_ALL=1 vynutí i Leaguepedii, i když od posledního pokusu neuběhla hodina)

import { join } from 'node:path';
import type { Bracket, Catalog, CzSkPlayer, GameDetail, GameSide, LeagueInfo, Match, Meta, SourceKey, SourceStatus, Team, Transfer } from '../shared/types';
import { TRACKED_LEAGUES, leagueName, leagueShort } from '../shared/leagues';
import { fetchLolesports, type LolesportsData } from './sources/lolesports';
import { fetchLeaguepedia, type GameRow, type LeaguepediaData } from './sources/leaguepedia';
import { changesToTransfers, mergeTransfers, rumorsToTransfers } from './transfers';
import { readJson, writeJsonAtomic } from './util';
import { teamKey } from '../shared/team-key';
import { loadStreamers } from './streamers';
import { copyFlags, resolveCountry, staleIds, type PlayerCountryCache } from './countries';

const ROOT = join(import.meta.dirname, '..');
const CACHE = join(ROOT, 'cache');
const OUT = join(ROOT, 'site', 'public', 'data');
const LEAGUEPEDIA_EVERY_MS = 55 * 60_000;
const GAMES_KEEP_DAYS = 400;

interface SourceResult<T> {
  data?: T;
  status: SourceStatus;
}

async function runSource<T>(key: SourceKey, prev: SourceStatus | undefined, fn: () => Promise<T>): Promise<SourceResult<T>> {
  const attempt = new Date().toISOString();
  const started = Date.now();
  try {
    const data = await fn();
    console.log(`✓ ${key} (${Math.round((Date.now() - started) / 1000)} s)`);
    await ping(process.env[`HC_${key.toUpperCase()}`]);
    return { data, status: { lastSuccess: attempt, lastAttempt: attempt } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`✗ ${key}: ${msg}`);
    return { status: { ...prev, lastAttempt: attempt, lastError: `${attempt} ${msg}`.slice(0, 300) } };
  }
}

async function ping(url: string | undefined): Promise<void> {
  if (!url) return;
  try {
    await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    /* hlídání je best-effort */
  }
}

export async function main(): Promise<void> {
  const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
  // Stav zdrojů se drží v cache/ (v CI se obnovuje z větve data); site/public/data je jen výstup.
  const prevMeta = (await readJson<Meta>(join(CACHE, 'meta.json'))) ?? (await readJson<Meta>(join(OUT, 'meta.json')));
  const prevLol = await readJson<LolesportsData>(join(CACHE, 'lolesports.json'));
  const prevLp = await readJson<LeaguepediaData>(join(CACHE, 'leaguepedia.json'));
  const prevTransfers = (await readJson<Transfer[]>(join(CACHE, 'transfers-state.json'))) ?? [];

  const lol = await runSource('lolesports', prevMeta?.sources.lolesports, () => fetchLolesports(now));
  if (lol.data) await writeJsonAtomic(join(CACHE, 'lolesports.json'), lol.data);
  const L = lol.data ?? prevLol;
  if (!L) throw new Error('Žádná data z lolesports (ani poslední platná). Nelze vygenerovat web.');

  // --- jen aktivní týmy: tým musí hrát v rozpisu své ligy nebo být v tabulce (vyřadí historické týmy bez soupisky) ---
  const activeKeys = new Set<string>();
  for (const m of L.matches) for (const t of m.teams) activeKeys.add(`${m.league}|${t.code}`);
  for (const s of L.standings) for (const r of s.rows) activeKeys.add(`${s.league}|${r.code}`);
  L.teams = L.teams.filter((t) => activeKeys.has(`${t.league}|${t.code}`) && t.players.length > 0);

  // --- státy hráčů: trvalá cache (stát se nemění), Leaguepedie se ptáme jen na nové přezdívky ---
  const countryCache = (await readJson<PlayerCountryCache>(join(CACHE, 'players.json'))) ?? {};
  const wantIds = staleIds(L.teams.flatMap((t) => t.players.map((p) => p.handle)), countryCache, now);
  // Leaguepedia jednou za hodinu (rate limit wiki). Podle posledního pokusu, ne podle minuty: cron na GitHubu se zpožďuje.
  const lpLast = prevMeta?.sources.leaguepedia?.lastAttempt;
  const lpDue = process.env.FORCE_ALL === '1' || !prevLp || !lpLast || now.getTime() - Date.parse(lpLast) >= LEAGUEPEDIA_EVERY_MS;
  const lp = lpDue
    ? await runSource('leaguepedia', prevMeta?.sources.leaguepedia, () => fetchLeaguepedia(now, undefined, { playerIds: wantIds }))
    : { data: undefined, status: prevMeta?.sources.leaguepedia ?? {} };
  if (!lpDue) console.log('· leaguepedia: poslední pokus před méně než hodinou, použita poslední data');

  if (lp.data?.players?.queried.length) {
    const at = now.toISOString();
    for (const id of lp.data.players.queried) {
      const key = id.toLowerCase();
      countryCache[key] = { at, rows: lp.data.players.rows.filter((r) => r.id.toLowerCase() === key).map(({ country, team, retired }) => ({ country, team, retired })) };
    }
    await writeJsonAtomic(join(CACHE, 'players.json'), countryCache);
  }
  if (lp.data) {
    const { players: _players, ...core } = lp.data;
    await writeJsonAtomic(join(CACHE, 'leaguepedia.json'), core);
  }
  const P = lp.data ?? prevLp;

  // --- CZ/SK ---
  const czskByHandle = new Map<string, 'CZ' | 'SK'>();
  for (const p of P?.czsk ?? []) czskByHandle.set(p.handle.toLowerCase(), p.country);
  const playerSlug = new Map<string, string>();
  for (const t of L.teams) {
    for (const p of t.players) {
      playerSlug.set(p.handle.toLowerCase(), p.slug);
      // seznam Čechů a Slováků má přednost (je úplný i pro jmenovce), jinak stát podle přezdívky a týmu
      p.country = czskByHandle.get(p.handle.toLowerCase()) ?? resolveCountry(p.handle, t.name, countryCache);
    }
  }
  const teamCzsk = new Map<string, Array<'CZ' | 'SK'>>();
  for (const t of L.teams) {
    const flags = [...new Set(t.players.map((p) => p.country).filter((x): x is 'CZ' | 'SK' => x === 'CZ' || x === 'SK'))];
    if (flags.length) teamCzsk.set(t.slug, flags);
  }

  // --- výsledky jednotlivých her z Leaguepedie ---
  const matches: Match[] = L.matches.map((m) => ({ ...m, teams: [{ ...m.teams[0] }, { ...m.teams[1] }] as Match['teams'] }));
  // Hry se hromadí v trvalé cache (zdroj vrací jen posledních 75 dní): detail zápasu tak nezmizí, když hra z okna vypadne.
  const gamesCache = (await readJson<Record<string, GameRow>>(join(CACHE, 'games.json'))) ?? {};
  for (const g of P?.games ?? []) gamesCache[`${g.matchId}|${g.n}`] = g;
  const gamesKeep = now.getTime() - GAMES_KEEP_DAYS * 86_400_000;
  for (const [k, g] of Object.entries(gamesCache)) if (Date.parse(g.dateTimeUtc) < gamesKeep) delete gamesCache[k];
  if (lp.data) await writeJsonAtomic(join(CACHE, 'games.json'), gamesCache);
  const details = attachGames(matches, Object.values(gamesCache));
  // jen pro build (stránky zápasů); do prohlížeče se neposílá, proto mimo site/public
  await writeJsonAtomic(join(CACHE, 'build', 'match-details.json'), Object.fromEntries(details));
  for (const m of matches) for (const t of m.teams) if (t.slug && teamCzsk.has(t.slug)) t.czsk = teamCzsk.get(t.slug);
  const brackets: Bracket[] = L.brackets.map((b) => ({
    ...b,
    rounds: b.rounds.map((r) => ({ ...r, matches: r.matches.map((bm) => matches.find((m) => m.id === bm.id) ?? bm) })),
  }));

  // --- přestupy ---
  const teamLeague = new Map<string, string>();
  for (const t of L.teams) teamLeague.set(teamKey(t.name), t.league);
  let transfers = prevTransfers;
  if (P) {
    const nowIso = now.toISOString();
    transfers = mergeTransfers(prevTransfers, changesToTransfers(P.changes, nowIso), rumorsToTransfers(P.rumors, nowIso), now, {
      teamLeague,
      czsk: czskByHandle,
      playerSlug,
    });
    await writeJsonAtomic(join(CACHE, 'transfers-state.json'), transfers);
  }

  // --- Češi a Slováci ---
  // Tým podle Leaguepedie (aktuální); když je prázdný a hráč je v soupisce sledované ligy, je to volný hráč
  // („naposledy {tým}“). Hráči bez týmu mimo sledované ligy se nezobrazují.
  const teamByName = new Map(L.teams.map((t) => [teamKey(t.name), t]));
  const rosterTeamOf = new Map<string, Team>();
  for (const t of L.teams) for (const p of t.players) rosterTeamOf.set(p.handle.toLowerCase(), t);
  const leagueRank = new Map(TRACKED_LEAGUES.map((l, i) => [l.slug, l.group === 'international' ? 99 : i]));
  const czsk: CzSkPlayer[] = (P?.czsk ?? [])
    .map((p): CzSkPlayer | undefined => {
      const roster = rosterTeamOf.get(p.handle.toLowerCase());
      if (!p.team && !roster) return undefined;
      const team = p.team ? teamByName.get(teamKey(p.team)) : roster;
      return {
        handle: p.handle,
        name: p.name || undefined,
        country: p.country,
        role: p.role,
        team: p.team || roster?.name || '',
        teamSlug: team?.slug,
        league: team?.league,
        freeAgent: !p.team || undefined,
        playerSlug: playerSlug.get(p.handle.toLowerCase()),
      };
    })
    .filter((x): x is CzSkPlayer => !!x)
    .sort((a, b) => (leagueRank.get(a.league ?? '') ?? 999) - (leagueRank.get(b.league ?? '') ?? 999) || a.handle.localeCompare(b.handle));

  // --- vlajky: zkopírovat jen státy, které se v datech vyskytují; stát bez vlajky se nezobrazí ---
  const usedCountries = ['CZ', 'SK', ...L.teams.flatMap((t) => t.players.map((p) => p.country)), ...transfers.map((t) => t.country)].filter((c): c is string => !!c);
  const flags = await copyFlags(usedCountries, ROOT, join(OUT, 'flags'));
  for (const t of L.teams) for (const p of t.players) if (p.country && !flags.has(p.country)) p.country = undefined;
  transfers = transfers.map((t) => (t.country && !flags.has(t.country) ? { ...t, country: undefined } : t));
  const withCountry = L.teams.flatMap((t) => t.players).filter((p) => p.country).length;
  console.log(`· státy hráčů: ${withCountry}/${L.teams.flatMap((t) => t.players).length} hráčů v soupiskách, ${flags.size} vlajek`);

  // --- výstupy pro web ---
  const buildId = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const leagues: LeagueInfo[] = L.leagues;
  for (const lg of TRACKED_LEAGUES) {
    const short = leagueShort(lg.slug);
    await writeJsonAtomic(join(OUT, 'schedule', `${short}.json`), matches.filter((m) => m.league === lg.slug));
    await writeJsonAtomic(join(OUT, 'standings', `${short}.json`), L.standings.find((s) => s.league === lg.slug) ?? null);
    await writeJsonAtomic(join(OUT, 'teams', `${short}.json`), L.teams.filter((t) => t.league === lg.slug));
  }
  for (const b of brackets) await writeJsonAtomic(join(OUT, 'brackets', `${b.tournament}.json`), b);
  const horizonLo = now.getTime() - 3 * 86_400_000;
  const horizonHi = now.getTime() + 21 * 86_400_000;
  await writeJsonAtomic(
    join(OUT, 'upcoming.json'),
    matches.filter((m) => {
      const t = Date.parse(m.startTime);
      return t >= horizonLo && t <= horizonHi;
    }),
  );
  await writeJsonAtomic(join(OUT, 'leagues.json'), leagues);
  await writeJsonAtomic(join(OUT, 'transfers.json'), transfers);
  await writeJsonAtomic(join(OUT, 'czsk.json'), czsk);
  await writeJsonAtomic(join(OUT, 'tournaments.json'), L.tournaments.filter((t) => brackets.some((b) => b.tournament === t.slug)));
  await writeJsonAtomic(join(OUT, 'catalog.json'), buildCatalog(L.leagues, L.teams, brackets));
  await writeJsonAtomic(join(OUT, 'streamers.json'), await loadStreamers(join(ROOT, 'config', 'streameri.yaml')));
  // meta.json se zapisuje jako poslední (ukazatel na data, R13)
  const meta: Meta = { buildId, generatedAt: now.toISOString(), sources: { lolesports: lol.status, leaguepedia: lp.status } };
  await writeJsonAtomic(join(CACHE, 'meta.json'), meta);
  await writeJsonAtomic(join(OUT, 'meta.json'), meta);
  await writeJsonAtomic(join(CACHE, 'last-run.json'), { at: now.toISOString(), lol: !!lol.data, lp: lpDue ? !!lp.data : 'skipped' });

  console.log(
    `Hotovo: ${matches.length} zápasů, ${L.teams.length} týmů, ${transfers.length} přestupů, ${czsk.length} Čechů a Slováků, ${brackets.length} pavouků. buildId=${buildId}`,
  );
  if (!lol.data || (lpDue && !lp.data)) process.exitCode = 0; // chyba zdroje není chyba běhu (R6)
}

/**
 * Páruje hry z Leaguepedie se zápasy lolesports podle dvojice týmů a času (−2 h až +12 h).
 * Do zápasu doplní stručné hry (vítěz, délka); vrací podrobnosti her podle id zápasu pro stránku zápasu.
 */
export function attachGames(matches: Match[], games: LeaguepediaData['games']): Map<string, GameDetail[]> {
  const details = new Map<string, GameDetail[]>();
  const byPair = new Map<string, LeaguepediaData['games']>();
  for (const g of games) {
    const key = [teamKey(g.team1), teamKey(g.team2)].sort().join('|');
    const list = byPair.get(key) ?? [];
    list.push(g);
    byPair.set(key, list);
  }
  for (const m of matches) {
    if (m.state !== 'completed') continue;
    const key = [teamKey(m.teams[0].name), teamKey(m.teams[1].name)].sort().join('|');
    const cands = byPair.get(key);
    if (!cands) continue;
    const start = Date.parse(m.startTime);
    const own = cands.filter((g) => {
      const t = Date.parse(g.dateTimeUtc);
      return t >= start - 2 * 3_600_000 && t <= start + 12 * 3_600_000;
    });
    if (!own.length) continue;
    const nameToCode = new Map(m.teams.map((t) => [teamKey(t.name), t.code]));
    const sorted = own.sort((a, b) => a.n - b.n).filter((g, i, all) => i === 0 || g.n !== all[i - 1].n);
    m.games = sorted.map((g) => ({ n: g.n, winnerCode: nameToCode.get(teamKey(g.winTeam)), durationSec: g.durationSec }));
    if (sorted.some((g) => g.sides)) {
      const side = (g: GameRow, i: 0 | 1): GameSide => {
        const name = i === 0 ? g.team1 : g.team2;
        return { name, code: nameToCode.get(teamKey(name)), picks: [], bans: [], players: [], ...g.sides?.[i] };
      };
      details.set(
        m.id,
        sorted.map((g) => ({ n: g.n, winnerCode: nameToCode.get(teamKey(g.winTeam)), durationSec: g.durationSec, patch: g.patch, vod: g.vod, blue: side(g, 0), red: side(g, 1) })),
      );
    }
  }
  return details;
}

function buildCatalog(leagues: LeagueInfo[], teams: Team[], brackets: Bracket[]): Catalog {
  return {
    leagues: leagues.map((l) => ({ id: l.slug, label: l.name, group: l.region, image: l.image })),
    teams: teams.map((t) => ({ id: t.slug, label: `${t.name} (${t.code})`, group: leagueName(t.league), league: t.league, code: t.code, image: t.image })),
    players: teams.flatMap((t) => t.players.map((p) => ({ id: p.slug, label: p.handle, group: t.code, league: t.league, team: t.slug, country: p.country }))),
    tournaments: brackets.map((b) => ({ id: b.tournament, label: b.name, group: leagueName(b.league), league: b.league })),
  };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('pipeline/run.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
