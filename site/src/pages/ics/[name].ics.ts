import type { APIRoute } from 'astro';
import { loadData, allTeams } from '../../lib/data';
import { buildIcs } from '../../../../shared/ics';
import { TRACKED_LEAGUES } from '../../../../shared/leagues';
import type { Match } from '../../../../shared/types';

export function getStaticPaths() {
  const data = loadData();
  const all: Match[] = Object.values(data.schedule).flat().filter((m): m is Match => !!m);
  const recent = (ms: Match[]) => ms.filter((m) => Date.parse(m.startTime) >= data.now.getTime() - 30 * 86_400_000);
  const paths = [
    ...TRACKED_LEAGUES.map((l) => ({ params: { name: `liga-${l.short}` }, props: { title: `${l.name} · LoL esport česky`, matches: recent(data.schedule[l.slug] ?? []) } })),
    ...allTeams().map((t) => ({
      params: { name: `tym-${t.slug}` },
      props: { title: `${t.name} · LoL esport česky`, matches: recent(all.filter((m) => m.teams.some((x) => x.slug === t.slug))) },
    })),
    { params: { name: 'cesi' }, props: { title: 'Češi a Slováci · LoL esport česky', matches: recent(all.filter((m) => m.teams.some((x) => x.czsk?.length))) } },
  ];
  return paths;
}

export const GET: APIRoute = ({ props }) => {
  const { title, matches } = props as { title: string; matches: Match[] };
  return new Response(buildIcs(title, matches, undefined, loadData().meta?.generatedAt), { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
};
