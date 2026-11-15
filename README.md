# LoL esport česky — lol.godmike.cz

Neoficiální český přehled League of Legends esportu, který se stará sám o sebe. Každých 15 minut stáhne
zápasy, výsledky, tabulky, soupisky a přestupy, postaví z nich statický web a nahraje změny na Forpsi.
Žádný redaktor, žádná databáze, žádné PHP.

- **Můj dashboard** (`/`): dlaždice, které si každý poskládá sám (Dnes, výsledky ligy, tabulka, soupiska týmu,
  hráč, pavouk turnaje, přestupy, Češi a Slováci, odpočet). Ukládá se v prohlížeči, sdílí odkazem `#d=…`.
- **Výsledky** (`/vysledky/`): vybrané ligy vedle sebe, tento týden / minulý týden / celý split, rozbalení her.
- **Přestupy** (`/prestupy/`): potvrzené i neoficiální, filtr podle ligy a „jen Češi a Slováci“.
- **Češi** (`/cesi/`): čeští a slovenští hráči ve světě.
- **Detail zápasu** (`/zapas/<id>/`): výsledek série a každá hra zvlášť: strany, sestavy a šampioni, zákazy, zabití, zlato, věže, draci, baroni, záznam.
- **Soupiska týmu** s přepínačem „Aktuální / Další split · odhad“ (potvrzené změny a spekulace z přestupů).
- Stránky lig, turnajů, týmů a hráčů s vlajkami států, kalendáře `.ics`, hledání s našeptávačem, režim bez spoilerů, světlý a tmavý režim.

## Vyzkoušet na svém počítači

Potřeba: Node.js 22 nebo novější.

```bash
npm install
npm run data      # stáhne data do cache/ a site/public/data/ (první běh ~1 min kvůli Leaguepedii)
npm run build     # postaví web do dist/ (~2 000 stránek, z toho ~1 350 zápasů)
npm run preview   # web na http://127.0.0.1:4321
```

Při úpravách vzhledu stačí `npm run dev` (web se obnovuje sám).
`FORCE_ALL=1 npm run data` stáhne i Leaguepedii, když od posledního pokusu neuběhla hodina.

## Jak to běží

```
GitHub Actions, každých 15 min (.github/workflows/pipeline.yml)
  1. npm run data    lolesports API (rozpis, výsledky, tabulky, pavouky, soupisky)
                     Leaguepedia jednou za hodinu (přestupy, drby, národnost hráčů, hry v sérii)
                     → při výpadku zdroje se použijí poslední platná data, web běží dál
  2. npm run build   Astro → statické HTML + JSON do dist/
  3. npm run deploy  FTPS na Forpsi, nahraje jen změněné soubory (manifest SHA-256)
  4. stav mezi běhy  větev „data“ v repozitáři (poslední data, historie přestupů)
```

Nasazení je navržené tak, aby nic nerozbilo běžící web: soubory se nahrávají pod dočasným jménem a pak
přejmenují, `data/meta.json` jde vždy poslední, přerušený běh příští běh dorovná, mazání starých souborů
se zastaví, pokud by nový build byl o víc než 20 % menší než ten minulý.

## Spuštění na lol.godmike.cz (jednorázově)

1. **Forpsi:** v administraci založte subdoménu `lol` pro godmike.cz. Forpsi ukládá subdomény do složky
   `/subdoms/lol` (ověřeno; ve `/www` běží hlavní web godmike.cz). Kdyby se složka změnila, upravte `ALLOWED_TARGETS`
   v `pipeline/deploy.ts` a nastavte proměnnou `FTP_DIR` (krok 4). Deploy do jiné složky odmítne zapsat.
2. **Forpsi:** zapněte SSL certifikát pro `lol.godmike.cz`. Pak můžete v `site/public/.htaccess`
   odkomentovat přesměrování na HTTPS.
3. **GitHub:** založte repozitář a nahrajte do něj tuto složku (`git push`). Doporučuji **veřejný**
   repozitář: v kódu nejsou žádná hesla a GitHub Actions jsou pro veřejné repozitáře zdarma bez limitu.
   Soukromý repozitář má zdarma 2 000 minut měsíčně, běh každých 15 minut spotřebuje zhruba 5 000–6 000.
4. **GitHub → Settings → Secrets and variables → Actions:**

   | Typ | Název | Hodnota |
   |---|---|---|
   | Secret | `FTP_HOST` | adresa FTP serveru z administrace Forpsi |
   | Secret | `FTP_USER` | FTP uživatel |
   | Secret | `FTP_PASSWORD` | FTP heslo |
   | Variable (volitelně) | `FTP_DIR` | cílová složka, pokud není `/subdoms/lol` |
   | Variable (volitelně) | `PUBLIC_GOATCOUNTER` | kód webu na goatcounter.com (anonymní statistiky) |
   | Secret (volitelně) | `HC_LOLESPORTS`, `HC_LEAGUEPEDIA`, `HC_DEPLOY` | adresy kontrol na healthchecks.io |

5. **GitHub → Actions → „Data a nasazení“ → Run workflow** (zaškrtněte Leaguepedii). První nasazení nahrává
   ~2 200 souborů; za 7 minut se všechno nestihne, zbytek dorovnají další běhy samy (web je mezitím použitelný).
6. Hotovo. Dál se web obnovuje sám každých 15 minut. Když nasazení selže (např. špatné heslo), běh zůstane
   zelený s upozorněním „Deploy“ v přehledu a data se příště nahrají znovu.

Ruční nasazení z počítače (PowerShell):

```powershell
$env:FTP_HOST='…'; $env:FTP_USER='…'; $env:FTP_PASSWORD='…'
npm run deploy -- --check   # jen se podívá, co je na serveru a co by se nahrálo
npm run deploy
```

## Jak se dělají změny

1. Změna se udělá a vyzkouší na počítači (`npm run build`, `npm run preview`, web na http://127.0.0.1:4321).
2. Po odsouhlasení se pošle na GitHub (`git push` do větve `main`).
3. Nasadí ji nejbližší automatický běh (do 15 minut), nebo hned ručně:
   `gh workflow run pipeline.yml` (případně Actions → „Data a nasazení“ → Run workflow).

Automatický běh staví vždy z větve `main`, takže na webu je to, co je na GitHubu. Ruční `npm run deploy` z počítače
je jen nouzová cesta; další automatický běh ho přepíše tím, co je v `main`.

## Údržba (jediná ruční věc)

`config/streameri.yaml`: čeští costreameři podle ligy (u zápasů se pak ukáže „Česky obvykle: …“).
Mění se zhruba na začátku splitu. Neznámý klíč ligy zastaví build, aby překlep tiše neschoval odkazy.

```yaml
lec:
  - name: Jméno kanálu
    url: https://www.twitch.tv/kanal
```

## Testy

```bash
npm run check   # TypeScript
npm test        # jednotkové testy (přestupy, dashboard, sezóna, formáty, bezpečnost, ics, deploy)
npm run e2e     # Playwright proti dist/ (nejdřív npm run build; jednou npx playwright install chromium)
```

## Hlídání

Volitelně tři kontroly na healthchecks.io (zdarma): lolesports, Leaguepedia a deploy. Když zdroj nebo
nasazení přestane fungovat, přijde e-mail. Na webu se po 6 hodinách bez čerstvých dat ukáže žlutá lišta.

## Řešení potíží

- **„Cílová složka … není povolená“**: `FTP_DIR` neodpovídá `ALLOWED_TARGETS` v `pipeline/deploy.ts`.
- **„deploy se zastavil, aby rozbitý build nesmazal web“**: nový build má o víc než 20 % méně souborů.
  Zkontrolujte běh; je-li to záměr, nasaďte ručně s `DEPLOY_ALLOW_SHRINK=1`.
- **Leaguepedia vrací „rate limit“**: nevadí, použijí se poslední data a příští hodinu se to zkusí znovu.
- **Push do větve data selže**: Settings → Actions → General → Workflow permissions → Read and write.

## Zdroje a licence

Data: lolesports.com (neoficiální veřejné API) a [Leaguepedia](https://lol.fandom.com/) (CC BY-SA 3.0; přestupy, drby,
státy hráčů). Vlajky: balík [flag-icons](https://github.com/lipis/flag-icons) (MIT).
LoL esport česky isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or
anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated
properties are trademarks or registered trademarks of Riot Games, Inc.

Designový systém „Rift“ (barvy, písma, 3D, animace, znak God Mike): `DESIGN.md`. Odložená práce: `TODOS.md`.
