# DESIGN.md — designový systém „Rift“

> Zdroj pravdy pro hodnoty je `site/src/styles/global.css` (sekce „tokeny“). Tento soubor popisuje, proč jsou takové
> a jak je používat. Vzhled zadal majitel webu 15. 11. 2026: 3D, animovaný, „ze světa hry“, s barvami, které nemá každý druhý web.

## Princip

Výsledková tabule vytesaná do kamenných desek, které se vznášejí nad runovým kruhem. Čísla a kódy týmů jsou hrdinové
stránky, text je krátký, všechno v pražském čase a česky. Motivy jsou vlastní (runy, krystaly, znak), nic převzatého
z grafiky hry.

## Znak a ikona

„God Mike“: písmeno **M** se **svatozáří** v šestiúhelníkovém štítu s drahokamem. Soubory: `site/public/favicon.svg`
(ikona webu) a `site/src/components/Emblem.astro` (v hlavičce; svatozář a drahokam pulzují, po najetí se znak otočí).

## Barvy

Dva režimy se záměrně liší náladou, ne jen jasem.

| Token | Tmavý „hlubina“ | Světlý „pergamen“ | Použití |
|---|---|---|---|
| `--bg` / `--bg-2` | `#04110f` / `#0a2420` | `#efe5cd` / `#f8f0dc` | pozadí scény (přechod) |
| `--surface` / `-2` / `-3` | `#0b211d` / `#12302a` / `#1a4038` | `#fbf5e6` / `#f1e7cd` / `#e6d9b9` | desky, tlačítka, najetí |
| `--inset` | `#06181a` | `#e9dec2` | zapuštěné prvky: skóre, pole, přepínače |
| `--line` / `--line-2` | `#1d463e` / `#2f6a5d` | `#d3c39d` / `#b6a274` | linky, okraje |
| `--ink` / `-2` / `-3` | `#eaf6ee` / `#a9c8bb` / `#7c9e91` | `#1a2a25` / `#44574e` / `#57665a` | text |
| `--accent` (+ `-hi`, `-lo`) | `#ff8f45` žhavá oranžová | `#b23a08` pálená rumělka | akce, vítěz, aktivní stav |
| `--mint` (+ `-lo`) | `#5cf2c2` přízračná mátová | `#0c6860` inkoustová zelená | magie: runy, krystaly, pruhy tabulky, fokus |
| `--live` | `#ff5d73` | `#b4231f` | „probíhá“ |
| `--confirmed` / `--rumor` | `#7fe7b2` / `#ffc061` | `#166534` / `#8f4400` | štítky přestupů |
| `--cz` / `--sk` | `#7fb4ff` / `#ff9d9d` | `#1d4ed8` / `#b91c1c` | štítky CZ a SK |
| `--depth` | `#0f332c` | `#c4b286` | boční hrana desek a tlačítek (3D tloušťka) |

Režim: bez uložené volby rozhoduje nastavení zařízení, jinak tmavý (D18). Dvojice text/pozadí cílí na kontrast WCAG AA.
Loga týmů jsou kreslená pro tmavé pozadí, proto vždy sedí na tmavém medailonu (`.m-coin`, `.logo`), i ve světlém režimu.

## Typografie

- **Cinzel** 700/900 (`--font-title`): nadpisy, názvy desek, značka. Malá písmena jsou kapitálky, takže se nepoužívá
  `text-transform: uppercase` (jména hráčů a týmů si drží velká a malá písmena).
- **Barlow Semi Condensed** 600/700 (`--font-display`): kódy týmů, skóre, časy, čísla.
- **IBM Plex Sans** 400/500/600 (`--font-ui`): text a ovládací prvky.
- Vše v buildu (fontsource), žádné volání cizích serverů s písmy.

## Prostor a 3D

- **Deska** (`.tile`, `.block`, `.res-col`, `.slab`): zkosené rohy `18px 5px`, boční hrana ze čtyř vrstev `--depth`,
  měkký stín pod ní, drahokam v levém horním rohu. Po najetí se zvedne a nakloní za kurzorem (max 2,6°).
  Vysoké desky (nad 560 px) se nenaklánějí. Žádný odlesk ani záře, které by jezdily za myší (majitel je nechtěl).
- **Kurzor** (`site/public/cursors/`, proměnné `--cur` a `--cur-go`): broušená čepel se zářezem, světlá s oranžovým
  hřbetem; nad odkazy a tlačítky rozžhavená s mátovým drahokamem. Hrot je u obou ve stejném bodě. V textových polích
  zůstává běžný textový kurzor.
- **Tlačítko**: má hranu `0 3px 0`; při stisku sjede o 3 px dolů a hrana zmizí.
- **Zapuštěné prvky** (skóre, hledání, přepínač období): `--inset` + vnitřní stín.
- **Scéna** (`components/Scene.astro`): dva runové kruhy položené v prostoru (náklon 66–68°, pomalá rotace),
  tři krystaly po stranách (jen od 1360 px), stoupající jiskry (canvas) a jemné zrno. Při posunu stránky lehká paralaxa.

## Pohyb

| Kde | Co |
|---|---|
| příchod na web | desky se „vynoří“ (náklon + posun), postupně po 85 ms; řádky uvnitř přijedou zleva. Jen jednou za návštěvu. |
| přechod mezi stránkami | jen krátké prolnutí (0,2 s), nic se neposouvá; úvodní animace se neopakuje a pozadí pokračuje, kde bylo |
| nabídka Ligy, toast, panely | rozbalení s 3D překlopením |
| odkrytí skóre (bez spoilerů) | destička se překlopí |
| rozbalení her série | seznam se odklopí shora |
| tabulka | pruhy úspěšnosti dorostou |
| živý zápas | pulzující tečka |

Úvodní animace běží podle hodin od načtení stránky (`--t0`, `client/fx.ts`): když prohlížeč obsah překreslí čerstvými
daty, animace naváže a při dalších překresleních (úpravy dashboardu) se už nespouští.

Plynulost přechodů (pravidla, která je potřeba držet):

- Pozadí (kruhy, krystaly, záře, jiskry) běží podle hodin (`--clock`, v jiskrách `Date.now()`), ne od načtení stránky.
  Nová animace pozadí proto musí mít `animation-delay: calc(var(--clock, 0) * -1ms)`.
- Úvodní animace obsahu mají ve zpoždění `- var(--t0, 0ms)`; při přechodu mezi stránkami je `--t0` obří (`html.nav`).
- Stránky s vlastním obsahem (dashboard, výběr výsledků) neukazují nejdřív výchozí podobu (`html.wait-own`).
- Po najetí na odkaz se stránka připraví dopředu (Speculation Rules v Chrome/Edge, jinde přednačtení Astro).

`prefers-reduced-motion: reduce` vypíná všechny animace, jiskry i krystaly; obsah zůstává stejný.

## Vzory

- **Zápas**: čas · tým A (kód, medailon) · skóre na destičce · tým B · Bo5 s rozbalením her. Skóre je vždy přesně
  uprostřed, vítěz má oranžovou číslici a prstenec kolem loga, poražený je ztlumený. V úzkém sloupci se čas a Bo
  přesunou nad řádek (container query).
- **Detail zápasu** (`/zapas/<id>/`): velká tabule série, pod ní karta pro každou hru. Vlevo je vždy první tým série,
  strana (modrá/červená, `--blue-side`/`--red-side`) je napsaná u týmu, protože se mezi hrami mění. Sestava: řádek má tři díly,
  dvě stejně široké půlky a mezi nimi pozici. Pozice jsou tak ve všech řádcích pod sebou přesně uprostřed karty,
  šampioni k nim přiléhají zleva i zprava se stejným odstupem a hráči jsou u vnějších okrajů. Stejný střední sloupec
  (`--g-mid`) mají i zákazy. Na úzké kartě je šampion nahoře a hráč pod ním, obojí u vnějšího okraje. Statistiky jsou dvoubarevný
  pruh s podílem. Šampioni jsou jen text (žádná převzatá grafika). Na detail vede skóre v každém řádku zápasu.
- **Soupiska** (stránka týmu, přes celou šířku; dlaždice na dashboardu): sestava po pozicích jako hráčské karty.
  Jedna mřížka: sloupec = pozice (nadpis s ikonou pozice), řada = pořadí hráče na pozici; řady jsou stejně vysoké,
  takže **všechny karty mají stejnou výšku**. Karta: fotka přes celou šířku, která dole přechází do karty, přes ni
  přezdívka s vlajkou, pod ní jméno na jeden řádek. Přechod je maska (fotka mizí do průhledna), ne překryvná vrstva
  v barvě karty: pod překryvem při najetí prosvítala tmavá čárka pod jménem.
  V úzkém kontejneru (pod 900 px) je to seznam s malou fotkou vlevo.
  Přepínač Aktuální / Další split · odhad (s počtem odchodů a příchodů).
- **Odhad soupisky**: stejné karty a na spodku každé stavový pruh (má ho i hráč, který zůstává, kvůli stejné výšce):
  „zůstává“ (mátový), „přichází ← tým“ (zelený, štítek „posila“), „možná odejde → tým“ a „možná přijde ← tým“
  (šrafovaný oranžový). Kandidát na příchod má čárkovaný rám, ztlumenou fotku a štítek „kandidát“; prázdná pozice
  kartu „volné místo“. Po najetí se karta zvedne a rozsvítí. Pod sestavou dva seznamy vedle sebe:
  **Odchody · kam hráč jde** a **Příchody · kdo může přijít**, každý řádek s logem týmu, štítkem potvrzeno/spekulace
  a zdrojem. Směr je šipka (oranžová ven, mátová dovnitř), aby se názvy týmů nemusely skloňovat.
- **Loga týmů se neotáčejí** (ani při najetí, ani při načtení stránky); majitel to nechtěl.
- **Hledání**: vlastní rozbalovací panel ve stylu nabídky Ligy (skupiny Týmy / Ligy / Turnaje / Hráči, logo nebo vlajka,
  zvýrazněná shoda, typ vpravo). Šipky + Enter, Escape zavře. Na mobilu stránka Hledat ve spodní navigaci.
- **Přehled výsledků**: každá liga je deska, každý zápas vlastní destička v mřížce. V úzkém sloupci (víc lig vedle
  sebe) dny odděluje stuha s kosočtvercem; v širokém sloupci (jedna liga, od 660 px) stuhy zmizí, destičky jdou za
  sebou ve třech sloupcích a datum je na každé destičce. **Období platí doslova:** liga, která ve zvoleném období
  nehrála, nedostane desku se staršími zápasy, jen jméno v řádku „bez zápasů“ pod přehledem. Když nehrála žádná
  z vybraných lig, je místo desek jedna zpráva s tlačítky na období, ve kterých se hrálo. Dokud si návštěvník období
  nevybere sám, ukáže se první, ve kterém se hrálo (tento týden → minulý týden → celý split).
- **Dashboard**: stejně široké sloupce, dva a od 1600 px tři (hlavní dlaždice přes všechny).
- **Fotka hráče**: na stránce hráče velký portrét v rámu (176 px, na mobilu 116 px); stahuje se zmenšená verze,
  původní obrázek je záloha.
- **Pavouk**: kola vedle sebe ve sloupcích, zápas je buňka o dvou řádcích (logo, kód, skóre; vítěz tučně a skóre
  akcentem). Zápas dalšího kola sedí přesně mezi dvojicí, ze které vzešel, a spojuje je tenká čára. Sloupce se
  nemačkají pod `--bm-min` a neroztahují nad `--bm-max`: když se nevejdou, pavouk se posouvá do strany, text
  z buněk nikdy nepřetéká. Play-off na dvě prohry (MSI) má horní pavouk, pod ním dolní a velké finále (od 760 px
  vpravo vedle nich). Bez spoilerů: skóre je otazník, na který se kliká; od druhého kola jsou skrytá i jména týmů.
- **Starty lig** (dlaždice na dashboardu, přes celou šířku): karta pro každou ligu, vlevo logo a název, vpravo velké
  číslo dní do startu; stavy „hraje se“ a „termín zatím není znám“. Bez výběru ligy ukáže všechny, rozdělené na
  hlavní ligy, regionální ligy a mezinárodní turnaje. Sousední dlaždice se starty se spojí do jedné desky.
- **Výběr týmu a hráče v dlaždici** (režim úprav): pole s vlastní nabídkou ve stylu hledání v hlavičce. Kliknutí
  ukáže všechny týmy po ligách, psaní v nich hledá; šipky, Enter, Escape. Systémová nabídka prohlížeče se nepoužívá.
- **Tabulka**: pořadí v odznaku (první zvýrazněný), pruh úspěšnosti, V–P.
- **Vlajky**: stát hráče je odznak s vlajkou (`.flag`, SVG z balíku flag-icons; ne emoji, Windows je nezobrazuje).
  U týmu v řádku zápasu vlajka znamená „v soupisce je Čech nebo Slovák“. Neznámý stát = žádný odznak.
- **Češi a Slováci**: vždy stejná mřížka o dvou řádcích: jméno, štítek, role (+ „volný hráč“) a liga vpravo / tým.
- **Přestup**: dva řádky — hráč, role, štítky / odkud → kam, zdroj, datum.
- **Spoilery (D11)**: jedno tlačítko v hlavičce; oko se dívá = výsledky jsou vidět, přeškrtnuté oko = skryté.
  Skryté skóre je destička „odkrýt“; nic dalšího nesmí vítěze prozradit (barvy, prstenec, ztlumení loga).
- **Výběr lig a filtry**: 3D přepínače; zaškrtávátko je kosočtverec, který se rozsvítí.
- **Prázdné stavy**: vždy říkají proč a co dál.

## Ikony

Vlastní sada tahových SVG ikon v `shared/icons.ts` (24×24, tah 1,8). Nové kreslit ve stejném stylu.

## Responzivita

- Obsah jde přes šířku obrazovky (`--maxw: 1880px`, okraj `--gutter` 16–56 px podle šířky). Na velké obrazovce
  se nepřidává prázdné místo ani se neroztahují řádky, ale přibývají sloupce: dashboard 3 (od 1600 px), hry v detailu
  zápasu 3 (od 1760 px), přestupy 2 (od 1600 px), destičky výsledků a Češi podle místa.
- Desky širší než 760 px se za kurzorem nenaklánějí (jen se zvednou).
- ≥ 900 px: horní navigace, dashboard a stránky ve dvou sloupcích, ligy ve výsledcích vedle sebe (mřížka od 310 px).
- < 900 px: spodní navigace, jeden sloupec, ligy jako záložky, výběr lig ve vysouvacím panelu.
- Dotykové cíle min. 44 px na dotykových zařízeních.
