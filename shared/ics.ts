// Kalendář .ics (RFC 5545) pro ligu, tým a „Češi“. Časy v UTC, popisky česky.

import type { Match } from './types';
import { leagueName } from './leagues';
import { estimatedSeriesMinutes } from './season';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function stamp(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '').replace(/Z?$/, 'Z');
}

const utf8 = new TextEncoder();

/** Zalomení řádků na 75 oktetů (RFC 5545 3.1); vícebajtové znaky (č, ř, –) se nikdy nerozdělí. */
export function fold(line: string): string {
  if (utf8.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = utf8.encode(ch).length;
    if (bytes + b > limit) {
      parts.push(cur);
      cur = '';
      bytes = 0;
      limit = 74; // pokračovací řádek začíná mezerou
    }
    cur += ch;
    bytes += b;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

export function buildIcs(name: string, matches: Match[], site = 'https://lol.godmike.cz', generatedAt = new Date().toISOString()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//lol-esport-cz//CS', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(name)}`, 'X-WR-TIMEZONE:Europe/Prague'];
  for (const m of [...matches].filter((x) => x.startTime).sort((a, b) => a.startTime.localeCompare(b.startTime))) {
    const start = new Date(m.startTime);
    const end = new Date(start.getTime() + estimatedSeriesMinutes(m.bestOf) * 60_000);
    const [a, b] = m.teams;
    const summary = `${leagueName(m.league)}: ${a.code} – ${b.code}`;
    const desc = `${a.name} vs. ${b.name} (Bo${m.bestOf})${m.block ? ` · ${m.block}` : ''}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${m.id}@lol-esport-cz`,
      `DTSTAMP:${stamp(generatedAt)}`,
      `DTSTART:${stamp(start.toISOString())}`,
      `DTEND:${stamp(end.toISOString())}`,
      `SUMMARY:${esc(summary)}`,
      `DESCRIPTION:${esc(desc)}`,
      `URL:${site}/vysledky/`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
