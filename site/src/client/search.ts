// Našeptávač hledání (D5): vlastní rozbalovací panel místo systémové nabídky prohlížeče.
// V hlavičce se rozbalí pod polem; na stránce /hledat/ (data-search="page") jsou výsledky přímo ve stránce.
// Ovládání: šipky nahoru/dolů, Enter otevře vybranou (nebo první) položku, Escape zavře.

import type { Catalog } from '../../../shared/types';
import { h, mount, type Child, type VNode } from '../../../shared/vnode';
import { icon } from '../../../shared/icons';
import { coin, flag } from '../../../shared/render';
import { buildIndex, findHits, groupHits, splitMatch, KIND_GROUP, KIND_LABEL, type Hit, type SearchItem } from '../../../shared/search';
import { getJson } from './data';

let indexPromise: Promise<SearchItem[]> | undefined;
function loadIndex(): Promise<SearchItem[]> {
  indexPromise ??= getJson<Catalog>('catalog.json').then(buildIndex);
  return indexPromise;
}

function hitIcon(hit: Hit): Child {
  if (hit.kind === 'player') return hit.country ? flag(hit.country) : h('span', { class: 'sr-dot', 'aria-hidden': 'true' });
  if (hit.image) return coin(hit.image);
  return h('span', { class: 'sr-dot', 'aria-hidden': 'true' });
}

function hitRow(hit: Hit, query: string, id: string): VNode {
  const [before, match, after] = splitMatch(hit.label, query);
  return h(
    'a',
    { class: 'sr-item', href: hit.href, id, role: 'option', 'aria-selected': 'false' },
    h('span', { class: 'sr-ic' }, hitIcon(hit)),
    h('span', { class: 'sr-main' }, h('span', { class: 'sr-label' }, before, match ? h('span', { class: 'sr-hl' }, match) : null, after), hit.sub ? h('span', { class: 'sr-sub' }, hit.sub) : null),
    h('span', { class: 'sr-kind' }, KIND_LABEL[hit.kind]),
  );
}

function setup(form: HTMLFormElement): void {
  const input = form.querySelector<HTMLInputElement>('input');
  const panel = form.querySelector<HTMLElement>('[data-search-panel]') ?? document.querySelector<HTMLElement>('[data-search-panel="page"]');
  if (!input || !panel) return;
  const inPage = form.dataset.search === 'page';
  const limit = inPage ? 40 : 8;
  const listId = panel.id || 'search-results';
  panel.id = listId;
  let hits: Hit[] = [];
  let active = -1;

  const options = () => [...panel.querySelectorAll<HTMLAnchorElement>('.sr-item')];
  const setActive = (i: number) => {
    active = i;
    options().forEach((o, k) => {
      o.classList.toggle('is-active', k === i);
      o.setAttribute('aria-selected', String(k === i));
    });
    const el = options()[i];
    if (el) {
      input.setAttribute('aria-activedescendant', el.id);
      el.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };
  const close = () => {
    if (inPage) return;
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  };
  const render = (query: string) => {
    const nodes: Child[] = [];
    if (!hits.length) {
      nodes.push(h('p', { class: 'sr-empty' }, 'Nic nenalezeno. Zkus kód týmu (třeba G2) nebo přezdívku hráče.'));
    } else {
      let n = 0;
      for (const g of groupHits(hits)) {
        nodes.push(h('p', { class: 'menu-h' }, KIND_GROUP[g.kind]));
        nodes.push(...g.hits.map((hit) => hitRow(hit, query, `${listId}-o${n++}`)));
      }
      if (!inPage && hits.length >= limit) {
        nodes.push(h('a', { class: 'sr-all', href: `/hledat/?q=${encodeURIComponent(query)}` }, `Všechny výsledky pro „${query}“`, icon('chevron', 'ic ic-s')));
      }
    }
    mount(panel, nodes);
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    active = -1;
    input.removeAttribute('aria-activedescendant');
  };
  const update = async () => {
    const query = input.value.trim();
    if (!query) {
      hits = [];
      if (inPage) mount(panel, [h('p', { class: 'sr-empty' }, 'Začni psát: kód týmu (G2), název týmu, přezdívku hráče nebo ligu.')]);
      else close();
      return;
    }
    const index = await loadIndex().catch(() => [] as SearchItem[]);
    if (input.value.trim() !== query) return; // mezitím se psalo dál
    hits = findHits(index, query, limit);
    render(query);
  };

  input.addEventListener('focus', () => {
    void loadIndex();
    if (input.value.trim()) void update();
  });
  input.addEventListener('input', () => void update());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!hits.length) return;
      e.preventDefault();
      const count = options().length;
      setActive(e.key === 'ArrowDown' ? (active + 1) % count : (active - 1 + count) % count);
    } else if (e.key === 'Escape') {
      if (!panel.hidden && !inPage) {
        e.preventDefault();
        close();
      } else input.value = '';
    }
  });
  form.addEventListener('submit', (e) => {
    const target = options()[active] ?? options()[0];
    if (target) {
      e.preventDefault();
      location.href = target.href;
    }
  });
  if (!inPage) {
    document.addEventListener('click', (e) => {
      if (!form.contains(e.target as Node)) close();
    });
    input.addEventListener('blur', () => setTimeout(() => !form.contains(document.activeElement) && close(), 120));
  }
  if (inPage) {
    const q = new URLSearchParams(location.search).get('q');
    if (q) {
      input.value = q;
      void update();
    }
  }
}

export function initSearch(): void {
  for (const form of document.querySelectorAll<HTMLFormElement>('form[data-search]')) setup(form);
}
