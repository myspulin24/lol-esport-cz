// Měření kanálů (revidovaná premisa 1): analytika bez cookies (GoatCounter, když je nastavený
// PUBLIC_GOATCOUNTER). Kampaň z ?utm_campaign= se drží v sessionStorage a události ji nesou.
// „dashboard upraven“ se pošle nejvýš jednou za návštěvu.

declare global {
  interface Window {
    goatcounter?: { count: (o: { path: string; title?: string; event?: boolean }) => void };
  }
}

function campaign(): string | undefined {
  try {
    const fromUrl = new URLSearchParams(location.search).get('utm_campaign');
    if (fromUrl) sessionStorage.setItem('utm_campaign', fromUrl.slice(0, 60));
    return sessionStorage.getItem('utm_campaign') ?? undefined;
  } catch {
    return undefined;
  }
}

export function track(event: string, detail?: string): void {
  const c = campaign();
  if (event === 'pageview') return; // pageview počítá GoatCounter sám
  if (event === 'dashboard-upraven') {
    try {
      if (sessionStorage.getItem('ev:dashboard-upraven')) return;
      sessionStorage.setItem('ev:dashboard-upraven', '1');
    } catch {
      /* bez úložiště posíláme jednou za načtení */
    }
  }
  const path = ['ev', event, detail, c ? `c-${c}` : undefined].filter(Boolean).join('/');
  try {
    window.goatcounter?.count({ path, title: event, event: true });
  } catch {
    /* analytika nesmí nic rozbít */
  }
}
