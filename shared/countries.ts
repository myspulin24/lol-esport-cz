// Státy hráčů: kód (ISO 3166-1 alpha-2 velkými písmeny, např. „KR“; části Británie „GB-ENG“) → český název a vlajka.
// Vlajky jsou SVG soubory, ne emoji: Windows vlajky jako emoji nezobrazuje (ukázal by jen písmena „CZ“).

let names: Intl.DisplayNames | undefined;

const SUBDIVISIONS: Record<string, string> = {
  'GB-ENG': 'Anglie',
  'GB-SCT': 'Skotsko',
  'GB-WLS': 'Wales',
  'GB-NIR': 'Severní Irsko',
  XK: 'Kosovo',
};

/** Český název státu pro popisek vlajky („KR“ → „Jižní Korea“). Neznámý kód vrátí beze změny. */
export function countryName(code: string): string {
  const cc = code.toUpperCase();
  if (SUBDIVISIONS[cc]) return SUBDIVISIONS[cc];
  try {
    names ??= new Intl.DisplayNames(['cs'], { type: 'region' });
    return names.of(cc) ?? cc;
  } catch {
    return cc;
  }
}

/** Platný kód státu (ochrana cesty k souboru vlajky). */
export function isCountryCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Z]{2}(-[A-Z]{3})?$/.test(code);
}

/** Cesta k vlajce; soubory kopíruje pipeline do site/public/data/flags/ jen pro státy, které se v datech vyskytují. */
export function flagSrc(code: string): string {
  return `/data/flags/${code.toLowerCase()}.svg`;
}
