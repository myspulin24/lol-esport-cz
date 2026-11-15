// Efekty „světa“: zavírání nabídek, náklon desek za kurzorem (3D) a jiskry na pozadí.
// Všechno je navíc: bez JS, na dotykových zařízeních nebo při omezení pohybu web funguje stejně, jen klidněji.

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Přechod mezi stránkami webu (ne první příchod): úvodní animace se nepřehrávají (třídu nastavuje Base.astro). */
const isNavigation = () => document.documentElement.classList.contains('nav');

/**
 * Úvodní animace desek běží podle „hodin“ od načtení stránky. Když prohlížeč obsah znovu vykreslí
 * (čerstvá data, úprava dashboardu), nastaví se --t0 na uplynulý čas: animace naváže tam, kde byla,
 * a po jejím konci se už při dalším vykreslení nespouští. Při přechodu mezi stránkami je rovnou „po konci“.
 */
export function introClock(el: HTMLElement): void {
  const offset = isNavigation() ? 1_000_000 : 0;
  el.style.setProperty('--t0', `${Math.round(offset + performance.now())}ms`);
}

// ---------- nabídky (Ligy): klik mimo a Escape zavírají ----------
function initMenus(): void {
  const open = () => document.querySelectorAll<HTMLDetailsElement>('details[data-menu][open]');
  document.addEventListener('click', (e) => {
    const target = e.target as Element;
    for (const d of open()) {
      if (!d.contains(target) || target.closest('a')) d.open = false;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const d of open()) {
      d.open = false;
      d.querySelector<HTMLElement>('summary')?.focus();
    }
  });
}

// ---------- náklon desek ----------
const TILT_SELECTOR = '.tile, .block, .res-col, .slab';
const TILT_MAX_HEIGHT = 560; // vysoké desky se nenaklánějí, jinak by se text u okrajů moc hýbal
const TILT_MAX_WIDTH = 760; // totéž u širokých desek (na velké obrazovce jdou přes celou šířku)
const TILT_DEG = 2.6;

function initTilt(): void {
  if (reduceMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let current: HTMLElement | null = null;
  let raf = 0;
  const release = (el: HTMLElement) => {
    el.classList.remove('is-hot');
    el.style.removeProperty('--rx');
    el.style.removeProperty('--ry');
  };
  document.addEventListener(
    'pointermove',
    (e) => {
      const el = (e.target as Element).closest?.<HTMLElement>(TILT_SELECTOR) ?? null;
      if (el !== current) {
        if (current) release(current);
        current = el;
      }
      if (!el) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        if (r.height <= TILT_MAX_HEIGHT && r.width <= TILT_MAX_WIDTH && !el.closest('.is-editing')) {
          el.style.setProperty('--ry', `${((px - 0.5) * 2 * TILT_DEG).toFixed(2)}deg`);
          el.style.setProperty('--rx', `${((0.5 - py) * 2 * TILT_DEG).toFixed(2)}deg`);
        }
        el.classList.add('is-hot');
      });
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => {
    if (current) release(current);
    current = null;
  });
}

// ---------- jiskry ----------
// Poloha každé jiskry je čistá funkce času (hodin), ne stavu: po přechodu na jinou stránku jsou jiskry
// přesně tam, kde byly, a pozadí tak při přepínání stránek neposkočí.
interface Ember {
  x: number; // 0–1 šířky
  phaseY: number; // 0–1 výšky
  r: number;
  vy: number; // px za sekundu
  sway: number;
  swaySpeed: number;
  alpha: number;
  color: number;
  twinkle: number;
}

/** Malý deterministický generátor (mulberry32): stejné jiskry na každé stránce. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EMBER_POOL = 44;
const EMBER_MARGIN = 14;

function makeEmbers(): Ember[] {
  const rnd = seeded(20261115);
  return Array.from({ length: EMBER_POOL }, () => ({
    x: rnd(),
    phaseY: rnd(),
    r: 0.6 + rnd() * 1.7,
    vy: 7 + rnd() * 17,
    sway: rnd() * Math.PI * 2,
    swaySpeed: 0.3 + rnd() * 0.8,
    alpha: 0.25 + rnd() * 0.5,
    color: Math.floor(rnd() * 3),
    twinkle: rnd() * Math.PI * 2,
  }));
}

function initEmbers(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-embers]');
  if (!canvas || reduceMotion()) return;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const embers = makeEmbers();
  let w = 0;
  let h = 0;
  let count = 0;
  let palette: string[] = [];
  const readPalette = () => {
    const cs = getComputedStyle(document.documentElement);
    palette = ['--ember-1', '--ember-2', '--ember-3'].map((v) => cs.getPropertyValue(v).trim() || '#ff8f45');
  };
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    count = Math.min(EMBER_POOL, Math.round((w * h) / 36_000));
  };

  // generace smyčky: po návratu na kartu nesmí vedle nové smyčky doběhnout i ta stará
  let generation = 0;
  const frame = (gen: number) => {
    if (gen !== generation) return;
    const t = (Date.now() % 86_400_000) / 1000; // stejné hodiny jako --clock v CSS
    const span = h + 2 * EMBER_MARGIN;
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < count; i++) {
      const p = embers[i];
      const travelled = (t * p.vy + p.phaseY * span) % span;
      const y = h + EMBER_MARGIN - travelled;
      const x = p.x * w + Math.sin(p.sway + t * p.swaySpeed) * 14;
      const a = p.alpha * (0.6 + 0.4 * Math.sin(p.twinkle + t * 2.2));
      ctx.fillStyle = palette[p.color] ?? '#ff8f45';
      ctx.globalAlpha = a * 0.16;
      ctx.beginPath();
      ctx.arc(x, y, p.r * 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(() => frame(gen));
  };
  const start = () => {
    generation++;
    if (document.hidden) return;
    const gen = generation;
    requestAnimationFrame(() => frame(gen));
  };

  readPalette();
  resize();
  start();
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', start);
  // přepnutí světlý/tmavý: jiné barvy jisker
  new MutationObserver(readPalette).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', readPalette);
}

export function initFx(): void {
  initMenus();
  initTilt();
  initEmbers();
}
