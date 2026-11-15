# TODOS

## Distribution

### Discord webhook „dnes se hraje / nové přestupy“

**What:** Discord webhook, který posílá potvrzené přestupy a jeden denní přehled zápasů.

**Why:** Distribuce přes Discordy costreamerů, jediný kanál, kterým podle premisy 1 přijdou čtenáři.

**Context:** Odloženo v /plan-eng-review D2 (2026-11-15). Pravidla už jsou navržená v design docu (sekce „Obsah generovaný z dat“): jen potvrzené přestupy; denní přehled prvním během po 8:00 Europe/Prague a jen ve dny se zápasem (R3-12); stav `state/posted.json` ve větvi `data`, commit hned po každém úspěšném odeslání (R3-13); vlastní kontrola v healthchecks.io pingnutá v každém běhu bez chyby webhooku, při chybě `/fail` (R3-11); chyba webhooku nikdy nezastaví nasazení. Spustit, až některý Discord server o bota požádá.

**Effort:** M
**Priority:** P2
**Depends on:** běžící pipeline (kroky 1–3 pořadí stavby), souhlas správce Discord serveru (webhook URL v GitHub Secrets)
