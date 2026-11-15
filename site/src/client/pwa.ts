// Aplikace (PWA): registrace service workeru, tlačítko instalace a nápověda pro iPhone.
// Service worker (site/sw.template.js) ukládá navštívené stránky a data, takže web funguje i bez připojení.

import { track } from './analytics';

/** Událost Chromu a Edge: prohlížeč je připravený nabídnout instalaci. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installEvent: InstallPromptEvent | undefined;

const standalone = (): boolean => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function showInstall(on: boolean): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-install]')) el.hidden = !on;
}

/** Adresy této stránky a všeho, co si už stáhla ze stejného serveru (styly, skripty, písma, data). */
function loadedUrls(): string[] {
  const own = (u: string) => {
    try {
      return new URL(u, location.href).origin === location.origin;
    } catch {
      return false;
    }
  };
  return [location.pathname, ...performance.getEntriesByType('resource').map((e) => e.name).filter(own)];
}

async function registerWorker(): Promise<void> {
  // Bez ovládajícího workeru jde o první návštěvu: po instalaci mu pošleme, co stránka načetla, ať to uloží.
  const first = !navigator.serviceWorker.controller;
  try {
    await navigator.serviceWorker.register('/sw.js');
    const reg = await navigator.serviceWorker.ready;
    if (first) reg.active?.postMessage({ type: 'warm', urls: loadedUrls() });
  } catch {
    /* prohlížeč service worker nepovolil (soukromé okno, staré zařízení): web funguje dál jako běžná stránka */
  }
}

export function initPwa(): void {
  if ('serviceWorker' in navigator) {
    // až po načtení stránky, ať registrace nezdržuje první vykreslení
    if (document.readyState === 'complete') void registerWorker();
    else window.addEventListener('load', () => void registerWorker(), { once: true });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // vlastní tlačítko místo lišty prohlížeče
    installEvent = e as InstallPromptEvent;
    showInstall(true);
  });
  window.addEventListener('appinstalled', () => {
    installEvent = undefined;
    showInstall(false);
    track('instalace');
  });
  document.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('[data-action="install"]') || !installEvent) return;
    const ev = installEvent;
    void ev.prompt().then(async () => {
      const { outcome } = await ev.userChoice;
      if (outcome === 'accepted') showInstall(false);
      installEvent = undefined; // nabídku jde použít jen jednou
    });
  });

  // iPhone a iPad instalaci nabídnout neumí; stačí říct, kde ji v Safari najít.
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && !standalone()) for (const el of document.querySelectorAll<HTMLElement>('[data-install-ios]')) el.hidden = false;
}
