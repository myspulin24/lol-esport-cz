// Klíč týmu pro párování mezi zdroji: „Gen.G Esports“ (lolesports) ~ „Gen.G“ (Leaguepedia),
// „Team Vitality“ ~ „Vitality“, „BILIBILI GAMING“ ~ „Bilibili Gaming“. Akademie se nezahazují.

const STOP = new Set(['esports', 'esport', 'gaming', 'team', 'club', 'gg', 'the']);

export function teamKey(name: string | undefined): string {
  if (!name) return '';
  const words = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const kept = words.filter((w) => !STOP.has(w));
  return (kept.length ? kept : words).join('');
}
