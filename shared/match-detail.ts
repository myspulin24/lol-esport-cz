// Stránka zápasu: velká výsledková tabule série a karty jednotlivých her (strany, sestavy, zákazy, statistiky).
// Podrobnosti her jsou z Leaguepedie (ScoreboardGames); u starších zápasů chybí a stránka ukáže jen sérii.

import type { GameDetail, GameSide, Match, MatchTeam } from './types';
import { h, type Child, type VNode } from './vnode';
import { icon } from './icons';
import { coin, czskTags, flag } from './render';
import { formatDuration } from './format';
import { matchStatus } from './season';

const ROLES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];

/** Hráč ze soupisek (pro odkaz a vlajku v sestavě hry). */
export interface KnownPlayer {
  slug: string;
  country?: string;
}

function teamName(t: MatchTeam): VNode {
  return t.slug ? h('a', { href: `/tym/${t.slug}/` }, t.name) : h('span', null, t.name);
}

/** Výsledková tabule série: tým – skóre – tým. */
export function matchHero(m: Match, now: Date): VNode {
  const st = matchStatus(m, now);
  const [a, b] = m.teams;
  const done = m.state === 'completed';
  const winA = done && a.outcome === 'win';
  const winB = done && b.outcome === 'win';
  const side = (t: MatchTeam, win: boolean, k: 'a' | 'b') =>
    h(
      'div',
      { class: `mh-team mh-team--${k}${win ? ' win' : ''}` },
      coin(t.image, 'm-coin m-coin--xl'),
      h('div', { class: 'mh-id' }, h('strong', { class: 'mh-code' }, t.code), h('span', { class: 'mh-name' }, teamName(t), ...czskTags(t.czsk))),
    );
  const middle = done
    ? h(
        'span',
        { class: 'm-status st-final' },
        h(
          'span',
          { class: 'sp', 'data-sp-label': `Odkrýt skóre ${a.code}–${b.code}` },
          h('span', { class: 'sp-v' }, h('b', { class: winA ? 'w' : undefined }, String(a.gameWins ?? 0)), h('span', { class: 'colon', 'aria-hidden': 'true' }, ':'), h('b', { class: winB ? 'w' : undefined }, String(b.gameWins ?? 0))),
        ),
      )
    : h('span', { class: `m-status st-${st.kind}` }, st.kind === 'live' ? h('span', { class: 'live-dot', 'aria-hidden': 'true' }) : null, st.kind === 'live' ? 'probíhá' : st.kind === 'awaiting' ? st.label : 'vs');
  return h(
    'div',
    { class: `mh${done ? ' is-final' : ''}`, 'data-spoiler': done ? '1' : undefined },
    side(a, winA, 'a'),
    h('div', { class: 'mh-mid' }, middle, h('span', { class: 'mh-bo' }, `Bo${m.bestOf}`)),
    side(b, winB, 'b'),
  );
}

/** Přehled série: kdo vyhrál kterou hru a jak dlouho trvala. */
export function seriesStrip(games: GameDetail[]): VNode {
  return h(
    'ol',
    { class: 'm-games mh-series' },
    ...games.map((g) =>
      h('li', { class: 'gm' }, h('a', { href: `#hra-${g.n}`, class: 'gm-n' }, `Hra ${g.n}`), h('span', { class: 'gm-w' }, g.winnerCode ?? '?'), g.durationSec ? h('span', { class: 'gm-d' }, formatDuration(g.durationSec)) : null),
    ),
  );
}

const STATS: Array<[keyof GameSide, string]> = [
  ['kills', 'Zabití'],
  ['gold', 'Zlato'],
  ['towers', 'Věže'],
  ['dragons', 'Draci'],
  ['barons', 'Baroni'],
  ['grubs', 'Void grubs'],
  ['heralds', 'Heraldi'],
  ['inhibitors', 'Inhibitory'],
];

function statValue(key: keyof GameSide, v: number): string {
  return key === 'gold' ? `${(v / 1000).toFixed(1).replace('.', ',')} tis.` : String(v);
}

/**
 * Karta jedné hry. Vlevo je vždy první tým série (jako v hlavičce), vpravo druhý;
 * strana (modrá/červená) se mezi hrami mění, proto je u týmu napsaná.
 */
export function gameCard(g: GameDetail, m: Match, players: Map<string, KnownPlayer>): VNode {
  const [a, b] = m.teams;
  const leftIsBlue = g.red.code === a.code ? false : true;
  const left = leftIsBlue ? g.blue : g.red;
  const right = leftIsBlue ? g.red : g.blue;
  const winLeft = !!g.winnerCode && g.winnerCode === a.code;
  const winRight = !!g.winnerCode && g.winnerCode === b.code;

  const teamHead = (t: MatchTeam, blue: boolean, win: boolean, k: 'a' | 'b') =>
    h(
      'div',
      { class: `g-team g-team--${k} ${blue ? 'is-blue' : 'is-red'}${win ? ' win' : ''}` },
      coin(t.image, 'm-coin m-coin--lg'),
      h('div', { class: 'g-team-id' }, h('strong', null, t.code), h('span', { class: 'g-side' }, blue ? 'modrá strana' : 'červená strana')),
      win ? h('span', { class: 'chip chip--win' }, 'výhra') : null,
    );
  const player = (name: string | undefined): Child[] => {
    if (!name) return [];
    const known = players.get(name.toLowerCase());
    return [h('span', { class: 'g-pname' }, known ? h('a', { href: `/hrac/${known.slug}/` }, name) : name), flag(known?.country)];
  };
  const lineup = h(
    'ul',
    { class: 'g-lineup', 'aria-label': 'Sestavy a šampioni' },
    ...ROLES.map((role, i) =>
      h(
        'li',
        { class: 'g-row' },
        // Tři díly: levá půlka, pozice přesně uprostřed, pravá půlka. Obě půlky jsou stejně široké, takže pozice
        // jsou ve všech řádcích pod sebou a šampioni k nim přiléhají zleva i zprava se stejným odstupem.
        h('span', { class: 'g-half g-half--a' }, h('span', { class: 'g-player' }, ...player(left.players[i])), h('span', { class: 'g-champ' }, left.picks[i] ?? '–')),
        h('span', { class: 'g-role' }, role),
        h('span', { class: 'g-half g-half--b' }, h('span', { class: 'g-champ' }, right.picks[i] ?? '–'), h('span', { class: 'g-player' }, ...player(right.players[i]))),
      ),
    ),
  );
  const bans = (side: GameSide, k: 'a' | 'b') => h('ul', { class: `g-banlist g-banlist--${k}` }, ...side.bans.map((c) => h('li', null, c)));
  const stats = STATS.filter(([key]) => typeof left[key] === 'number' || typeof right[key] === 'number').map(([key, label]) => {
    const va = (left[key] as number | undefined) ?? 0;
    const vb = (right[key] as number | undefined) ?? 0;
    const share = va + vb > 0 ? Math.round((va / (va + vb)) * 100) : 50;
    return h(
      'div',
      { class: 'g-stat' },
      h('span', { class: `g-val g-val--a${va > vb ? ' hi' : ''}` }, statValue(key, va)),
      h('span', { class: 'g-statmid' }, h('span', { class: 'g-label' }, label), h('span', { class: 'g-bar', style: `--p:${share}%`, 'aria-hidden': 'true' })),
      h('span', { class: `g-val g-val--b${vb > va ? ' hi' : ''}` }, statValue(key, vb)),
    );
  });

  return h(
    'section',
    { class: `block game ${leftIsBlue ? 'game--ab' : 'game--ba'}`, id: `hra-${g.n}`, 'aria-labelledby': `hra-${g.n}-h` },
    h(
      'h2',
      { id: `hra-${g.n}-h` },
      `Hra ${g.n}`,
      h('span', { class: 'h-sub' }, [g.durationSec ? formatDuration(g.durationSec) : null, g.patch ? `patch ${g.patch}` : null].filter(Boolean).join(' · ')),
      g.vod ? h('a', { class: 'g-vod', href: g.vod, rel: 'noopener', target: '_blank' }, 'Záznam', icon('external', 'ic ic-s')) : null,
    ),
    h('div', { class: 'g-head' }, teamHead(a, leftIsBlue, winLeft, 'a'), teamHead(b, !leftIsBlue, winRight, 'b')),
    left.picks.length || right.picks.length ? lineup : null,
    left.bans.length || right.bans.length ? h('div', { class: 'g-bans' }, bans(left, 'a'), h('span', { class: 'g-banlabel' }, 'Zákazy'), bans(right, 'b')) : null,
    stats.length ? h('div', { class: 'g-stats' }, ...stats) : null,
  );
}
