// Jednoduchý strom prvků sdílený serverem (Astro, VNode.astro) a prohlížečem (toDom).
// Texty se vždy vkládají jako text (Astro výrazy / textContent), nikdy jako HTML (R4/D9).

import { safeUrl } from './safe-url';

export type Child = VNode | string | number | null | undefined | false;
export type AttrValue = string | number | boolean | undefined | null;

export interface VNode {
  tag: string;
  attrs: Record<string, AttrValue>;
  children: Child[];
}

type ChildInput = Child | ChildInput[];

export function h(tag: string, attrs?: Record<string, AttrValue> | null, ...children: ChildInput[]): VNode {
  return { tag, attrs: attrs ?? {}, children: flatten(children) };
}

function flatten(input: ChildInput[]): Child[] {
  const out: Child[] = [];
  for (const c of input) {
    if (Array.isArray(c)) out.push(...flatten(c));
    else if (c !== null && c !== undefined && c !== false && c !== '') out.push(c);
  }
  return out;
}

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'article', 'aside', 'b', 'button', 'dd', 'details', 'div', 'dl', 'dt', 'em', 'footer', 'h2', 'h3', 'h4', 'header', 'img',
  'input', 'label', 'li', 'nav', 'ol', 'option', 'optgroup', 'p', 'path', 'section', 'select', 'small', 'span', 'strong', 'summary', 'svg',
  'table', 'tbody', 'td', 'th', 'thead', 'time', 'tr', 'ul', 'circle', 'line', 'polyline', 'rect',
]);

/** Bezpečný odkaz: interní cesta, kotva, nebo http(s). Jinak undefined. */
export function safeHref(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  if (v.startsWith('#') || v.startsWith('?')) return v;
  return safeUrl(v);
}

/** Vyčistí atributy: žádné on*, href/src jen bezpečné, boolean → přítomnost. */
export function cleanAttrs(attrs: Record<string, AttrValue>): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (/^on/i.test(k)) continue;
    if (k === 'href' || k === 'src') {
      const s = safeHref(v);
      if (s) out[k] = s;
      continue;
    }
    out[k] = v === true ? true : String(v);
  }
  return out;
}

export function isAllowedTag(tag: string): boolean {
  return ALLOWED_TAGS.has(tag);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'line', 'polyline', 'rect']);

/** Prohlížeč: VNode → DOM (jen createElement/textContent/setAttribute). */
export function toDom(node: Child, doc: Document = document): Node | null {
  if (node === null || node === undefined || node === false) return null;
  if (typeof node === 'string' || typeof node === 'number') return doc.createTextNode(String(node));
  if (!isAllowedTag(node.tag)) return doc.createTextNode('');
  const el = SVG_TAGS.has(node.tag) ? doc.createElementNS(SVG_NS, node.tag) : doc.createElement(node.tag);
  for (const [k, v] of Object.entries(cleanAttrs(node.attrs))) {
    if (v === true) el.setAttribute(k, '');
    else if (typeof v === 'string') el.setAttribute(k, v);
  }
  for (const c of node.children) {
    const child = toDom(c, doc);
    if (child) el.appendChild(child);
  }
  return el;
}

/** Nahradí obsah prvku stromem. */
export function mount(target: Element, nodes: Child | Child[]): void {
  target.replaceChildren();
  for (const n of Array.isArray(nodes) ? nodes : [nodes]) {
    const d = toDom(n);
    if (d) target.appendChild(d);
  }
}
