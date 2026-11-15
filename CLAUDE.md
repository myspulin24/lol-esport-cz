# LoL esport česky (lol.godmike.cz)

Statický web (Astro) s daty z lolesports a Leaguepedie. GitHub Actions ho každých 15 minut přestaví a nahraje
přes FTPS na Forpsi; běh spouští vnější služba cron-job.org (plánovač GitHubu je jen hodinová záloha).
Podrobnosti: `README.md` (provoz), `DESIGN.md` (vzhled), `TODOS.md` (odložená práce).

## Jak se na projektu pracuje

1. Změnu udělat lokálně a ověřit: `npm run check`, `npm test`, `npm run build`, `npm run e2e`.
2. Ukázat ji majiteli na localhostu (`npm run preview`, http://127.0.0.1:4321).
3. Teprve po jeho souhlasu commit a push do `main`; nasazení udělá automatický běh (nebo `gh workflow run pipeline.yml`).

Bez výslovného pokynu necommitovat, nepushovat a nenasazovat.

## Na co si dát pozor

- Cílová složka na FTP je `/subdoms/lol`. Ve `/www` a v ostatních složkách `/subdoms` běží jiné weby majitele;
  deploy na ně nesmí sáhnout (hlídá to `ALLOWED_TARGETS` v `pipeline/deploy.ts`).
- Přístupy k FTP jsou jen v GitHub Secrets (`FTP_HOST`, `FTP_USER`, `FTP_PASSWORD`), nikdy v repozitáři.
- Před zásahem na server nejdřív `npm run deploy -- --check` (jen čte).
- Do větve `data` zapisuje jen automatický běh (robot). Ručně do ní nepushovat a nezakládat z ní pull request:
  jsou v ní jen uložená data, ne kód, a po ručním pushi GitHub majiteli ukazuje výzvu „Compare & pull request“.
- Texty webu jsou česky. Vzhled a pravidla animací drží `DESIGN.md`; při změně vzhledu ho aktualizovat.
- Obsah z cizích zdrojů se nikdy nevkládá jako HTML (`shared/vnode.ts`, žádné `innerHTML`).

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. Route only to skills in the session's available-skills list; answer directly for quick questions or small scoped edits.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- QA/testing site behavior → invoke /qa
- Code review/diff check → invoke /review
- Ship/deploy/PR → invoke /ship

Do not suggest or auto-invoke other gstack skills: they run when the user types them, or when a running skill hands off to them (`gstack-config set proactive all` routes every skill).
