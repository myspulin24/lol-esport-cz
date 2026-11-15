// Ikony aplikace (PWA) z site/public/favicon.svg. Výsledek se ukládá do site/public/icons/ a commituje;
// spouští se ručně, když se změní znak: node scripts/make-icons.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SRC = join('site', 'public', 'favicon.svg');
const OUT = join('site', 'public', 'icons');
const svg = readFileSync(SRC);
mkdirSync(OUT, { recursive: true });

/** Znak na průhledném pozadí přes celou plochu. */
const plain = (size) => sharp(svg, { density: 600 }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png();

/**
 * Znak na tmavém pozadí s okrajem: systém si ikonu sám ořízne (kruh, zaoblený čtverec),
 * proto musí být znak uvnitř bezpečné zóny. `scale` = podíl plochy, který znak zabere.
 */
async function padded(size, scale) {
  const inner = Math.round(size * scale);
  const emblem = await plain(inner).toBuffer();
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#12302a"/><stop offset="1" stop-color="#04110f"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
  return sharp(bg).composite([{ input: emblem, gravity: 'centre' }]).png();
}

const jobs = [
  ['icon-192.png', plain(192)],
  ['icon-512.png', plain(512)],
  ['maskable-192.png', await padded(192, 0.66)],
  ['maskable-512.png', await padded(512, 0.66)],
  ['apple-touch-icon.png', await padded(180, 0.8)],
];
for (const [name, img] of jobs) {
  const info = await img.toFile(join(OUT, name));
  console.log(`${name}: ${info.width}×${info.height}, ${info.size} B`);
}
