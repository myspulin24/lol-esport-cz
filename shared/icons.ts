// D15: jedna sada linkových SVG ikon, vždy s textovým popiskem vedle (ikony jsou aria-hidden).
import { h, type VNode } from './vnode';

const PATHS: Record<string, string[]> = {
  calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  share: ['M8 12h8', 'M14 7l5 5-5 5', 'M5 5v14'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13 7l4 4'],
  grip: ['M9 6h.01', 'M15 6h.01', 'M9 12h.01', 'M15 12h.01', 'M9 18h.01', 'M15 18h.01'],
  eye: ['M2 12s4-6.5 10-6.5S22 12 22 12s-4 6.5-10 6.5S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  eyeoff: ['M3 3l18 18', 'M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3 3.5', 'M6.4 7.4C4.3 8.9 3 12 3 12s4 6 9 6a8.6 8.6 0 0 0 4.2-1.1', 'M9.9 9.9a3 3 0 0 0 4.2 4.2'],
  warning: ['M12 3l10 18H2z', 'M12 10v4', 'M12 17.5v.01'],
  chevron: ['M9 6l6 6-6 6'],
  down: ['M6 9l6 6 6-6'],
  up: ['M6 15l6-6 6 6'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  plus: ['M12 5v14', 'M5 12h14'],
  check: ['M5 12l5 5 9-10'],
  roleTop: ['M8 21V9l4-5 4 5v12z', 'M8 13h8'],
  roleJungle: ['M5 19c0-8 5-13 14-14-1 9-6 14-14 14z', 'M5 19l8-8'],
  roleMid: ['M12 3l9 9-9 9-9-9z', 'M8 16l8-8'],
  roleBot: ['M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M12 2v5', 'M12 17v5', 'M2 12h5', 'M17 12h5'],
  roleSupport: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M12 9v6', 'M9 12h6'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21a8 8 0 0 1 16 0'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M21 21l-5-5'],
  sun: ['M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  moon: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'],
  home: ['M4 11l8-7 8 7', 'M6 10v10h12V10'],
  list: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  swap: ['M7 7h13l-4-4', 'M17 17H4l4 4'],
  flag: ['M5 21V4', 'M5 4h12l-2 4 2 4H5'],
};

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, cls = 'ic'): VNode {
  return h(
    'svg',
    { class: cls, viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' },
    ...(PATHS[name] ?? []).map((d) => h('path', { d })),
  );
}
