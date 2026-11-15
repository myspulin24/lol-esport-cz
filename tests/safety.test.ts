// R4: obsah z cizích zdrojů (Leaguepedia je editovatelná wiki) se nikdy nedostane do stránky jako HTML ani jako nebezpečný odkaz.
import { describe, expect, it } from 'vitest';
import { plainText, safeUrl } from '../shared/safe-url';
import { cleanAttrs, h, isAllowedTag, safeHref } from '../shared/vnode';

describe('safeUrl', () => {
  it('pustí jen http a https', () => {
    expect(safeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeUrl('  http://example.com  ')).toBe('http://example.com/');
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('JaVaScRiPt:alert(1)')).toBeUndefined();
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeUrl('')).toBeUndefined();
    expect(safeUrl(42)).toBeUndefined();
  });
});

describe('plainText', () => {
  it('odstraní značky a entity', () => {
    expect(plainText('<b>Ahoj</b>&nbsp;&amp;  <img src=x onerror=alert(1)>svete')).toBe('Ahoj & svete');
    expect(plainText(null)).toBe('');
  });
});

describe('safeHref a cleanAttrs', () => {
  it('interní cesty a kotvy ano, protokolově relativní a javascript ne', () => {
    expect(safeHref('/tym/g2-esports/')).toBe('/tym/g2-esports/');
    expect(safeHref('#d=abc')).toBe('#d=abc');
    expect(safeHref('//evil.example/')).toBeUndefined();
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
  });
  it('zahodí on* atributy, nebezpečné odkazy a false hodnoty', () => {
    expect(
      cleanAttrs({ onclick: 'alert(1)', ONLOAD: 'x', href: 'javascript:alert(1)', class: 'a', hidden: true, disabled: false, title: undefined, 'data-n': 3 }),
    ).toEqual({ class: 'a', hidden: true, 'data-n': '3' });
    expect(cleanAttrs({ src: 'https://example.com/x.png' })).toEqual({ src: 'https://example.com/x.png' });
  });
  it('script, iframe a style nejsou povolené značky', () => {
    expect(isAllowedTag('div')).toBe(true);
    expect(isAllowedTag('script')).toBe(false);
    expect(isAllowedTag('iframe')).toBe(false);
    expect(isAllowedTag('style')).toBe(false);
  });
  it('h() drží text jako text (žádné HTML)', () => {
    const node = h('span', null, '<img src=x onerror=alert(1)>');
    expect(node.children).toEqual(['<img src=x onerror=alert(1)>']);
  });
});
