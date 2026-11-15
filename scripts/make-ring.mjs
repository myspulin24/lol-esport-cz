// Vygeneruje site/public/ring.svg: runový kruh pro pozadí (components/Scene.astro ho používá jako masku,
// takže se stáhne jednou a barvu bere z CSS). Spustit po úpravě kresby: node scripts/make-ring.mjs
// Runy jsou vlastní geometrické znaky, žádné převzaté symboly.
import { writeFileSync } from 'node:fs';

const ticks = Array.from({ length: 72 }, (_, i) => i * 5);
const glyphs = [
  'M-7 -10 0 10 7 -10',
  'M0 -10V10M-6 -4 0 2 6 -4',
  'M-6 -10H6L-6 10H6',
  'M0 -10 7 0 0 10 -7 0Z',
  'M-6 10V-10L6 0 -6 4',
  'M-7 -10 7 10M7 -10 -7 10',
  'M0 -10V10M-6 -10H6M-4 10H4',
  'M-6 10 0 -10 6 10M-3 2H3',
  'M-6 -10V10M-6 0 6 -10M-6 0 6 10',
  'M-6 -10V10L6 4',
  'M-6 -6A8.5 8.5 0 1 1 -6 6M-6 0H4',
  'M-7 6 -3 -10 0 2 3 -10 7 6',
];
const hex = (r, rot = 0) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = ((i * 60 + rot) * Math.PI) / 180;
    return `${(r * Math.sin(a)).toFixed(1)},${(-r * Math.cos(a)).toFixed(1)}`;
  }).join(' ');

const parts = [
  '<circle r="292" stroke-width="1.6"/>',
  '<circle r="276" stroke-width=".8" stroke-dasharray="2 9"/>',
  ...ticks.map((a, i) => `<line y1="${i % 3 === 0 ? -246 : -254}" y2="-264" transform="rotate(${a})" stroke-width="${i % 6 === 0 ? 1.8 : 1}"/>`),
  '<circle r="238" stroke-width="1.2"/>',
  ...glyphs.map((d, i) => `<path d="${d}" transform="rotate(${i * 30}) translate(0 -207)" stroke-width="1.8"/>`),
  '<circle r="176" stroke-width="1.2"/>',
  `<polygon points="${hex(176)}"/>`,
  `<polygon points="${hex(176, 30)}"/>`,
  '<circle r="112" stroke-width=".9" stroke-dasharray="14 8"/>',
  `<polygon points="${hex(58)}" stroke-width="1.4"/>`,
  '<path d="M0 -26 18 0 0 26 -18 0Z" stroke-width="1.4"/>',
];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-300 -300 600 600" fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</svg>\n`;
writeFileSync(new URL('../site/public/ring.svg', import.meta.url), svg);
console.log(`ring.svg: ${svg.length} bajtů`);
