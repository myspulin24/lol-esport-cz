// R4/D9: odkazy z externích zdrojů (Leaguepedia je editovatelná wiki) pouštíme dál jen se schématem http/https.

export function safeUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

/** Odstraní HTML entity a značky z textu ze zdroje (Leaguepedia vrací např. &nbsp;). Výsledek je vždy prostý text. */
export function plainText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Zmenšená verze obrázku z lolesports (stejná služba, jakou používá web lolesports). Originály fotek hráčů mají
 * kolem 700 kB; zmenšenina je zlomek. Když služba neodpoví, stránka použije původní obrázek (atribut data-full).
 */
export function thumbUrl(url: string, width: number): string {
  return `https://am-a.akamaihd.net/image?resize=${Math.round(width)}:&f=${encodeURIComponent(url)}`;
}

/** Obrázek ze zdroje: jen http(s) a vždy přes https (web běží na https, http obrázek by prohlížeč zablokoval). */
export function imageUrl(raw: unknown): string | undefined {
  const u = safeUrl(raw);
  return u?.replace(/^http:\/\//, 'https://');
}
