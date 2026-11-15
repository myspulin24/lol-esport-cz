// Jednotné formáty (D23): čas Europe/Prague, 24h, „čt 15. 1.“, „dnes“/„zítra“.

export const TZ = 'Europe/Prague';

const WEEKDAYS = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];

/** Vrátí {y,m,d,hh,mm,wd} v časové zóně Europe/Prague. */
export function pragueParts(date: Date): { y: number; m: number; d: number; hh: number; mm: number; wd: number } {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const parts = Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]));
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    hh: Number(parts.hour),
    mm: Number(parts.minute),
    wd: wdMap[parts.weekday as string] ?? 0,
  };
}

/** Klíč dne v Praze, např. "2026-11-15". */
export function dayKey(date: Date): string {
  const p = pragueParts(date);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** „18:00“ */
export function formatTime(iso: string | Date): string {
  const p = pragueParts(typeof iso === 'string' ? new Date(iso) : iso);
  return `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`;
}

/** „čt 15. 1.“ */
export function formatDate(iso: string | Date): string {
  const p = pragueParts(typeof iso === 'string' ? new Date(iso) : iso);
  return `${WEEKDAYS[p.wd]} ${p.d}. ${p.m}.`;
}

/** „dnes“ / „zítra“ / „včera“ / „čt 15. 1.“ */
export function formatRelativeDay(iso: string | Date, now: Date = new Date()): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const diff = dayDiff(d, now);
  if (diff === 0) return 'dnes';
  if (diff === 1) return 'zítra';
  if (diff === -1) return 'včera';
  return formatDate(d);
}

/** Rozdíl kalendářních dní v Praze (a - b). */
export function dayDiff(a: Date, b: Date): number {
  const pa = pragueParts(a);
  const pb = pragueParts(b);
  const ua = Date.UTC(pa.y, pa.m - 1, pa.d);
  const ub = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((ua - ub) / 86_400_000);
}

/** „31:12“ */
export function formatDuration(sec?: number): string {
  if (sec == null || !Number.isFinite(sec)) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** „před 12 min“, „před 3 h“, „před 2 dny“ */
export function formatAgo(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return 'neznámo';
  const min = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'právě teď';
  if (min < 60) return `před ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `před ${h} h`;
  const d = Math.round(h / 24);
  return `před ${d} dny`;
}

/** Počet dní do data (Praha), např. pro odpočet. */
export function daysUntil(dateYmd: string, now: Date = new Date()): number {
  const [y, m, d] = dateYmd.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d, 12));
  return dayDiff(target, now);
}

export const ROLE_CS: Record<string, string> = {
  top: 'Top',
  jungle: 'Jungle',
  mid: 'Mid',
  bottom: 'ADC',
  bot: 'ADC',
  support: 'Support',
  none: 'Hráč',
};

export function roleCs(role?: string): string {
  if (!role) return '';
  return ROLE_CS[role.toLowerCase()] ?? role;
}

export function pluralDays(n: number): string {
  if (n === 1) return '1 den';
  if (n >= 2 && n <= 4) return `${n} dny`;
  return `${n} dní`;
}

const STAGE_CS: Array<[RegExp, string]> = [
  [/regular season|round robin/i, 'Základní část'],
  [/play-?offs?|knockouts?|bracket/i, 'Play-off'],
  [/swiss/i, 'Švýcarský systém'],
  [/groups?/i, 'Skupiny'],
  [/play-?in/i, 'Play-in'],
];

/** Blok rozpisu z lolesports česky („Semifinals“ → „Semifinále“, „Week 3“ → „3. týden“). Neznámé nechá být. */
export function blockCs(block?: string): string {
  if (!block) return '';
  const b = block.trim();
  const week = b.match(/^week (\d+)$/i);
  if (week) return `${week[1]}. týden`;
  const round = b.match(/^round (\d+)$/i);
  if (round) return `${round[1]}. kolo`;
  if (/^finals?$/i.test(b)) return 'Finále';
  if (/^semi-?finals?$/i.test(b)) return 'Semifinále';
  if (/^quarter-?finals?$/i.test(b)) return 'Čtvrtfinále';
  return stageCs(b);
}

/** Název fáze soutěže z lolesports česky („Regular Season“ → „Základní část“). Neznámé nechá být. */
export function stageCs(stage?: string): string {
  if (!stage) return '';
  return STAGE_CS.find(([re]) => re.test(stage))?.[1] ?? stage;
}
