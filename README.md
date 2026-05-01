# Setup Claude Code dla sprawdzamszlak.pl

Kompletny zestaw subagentów + slash commands + ustawień dla rozwoju projektu w stanie:
- Dwa osobne repo (`sprawdzamszlak-frontend` + `sprawdzamszlak-infrastructure`)
- Stack AWS: Next.js + Lambda + DynamoDB + S3 + Terraform
- Cel: monorepo, integracje Strava/Garmin, sensowny landing, security hardening

## Gdzie to zainstalować

**Rekomendacja:** stwórz nowy katalog **nadrzędny** który będzie przyszłym monorepo:

```bash
mkdir -p ~/repos/sprawdzamszlak
cd ~/repos/sprawdzamszlak

# Rozpakuj setup tutaj:
tar -xzf sprawdzamszlak-claude-setup.tar.gz

# Dodaj symlinki do istniejących repo (tymczasowo):
ln -s ../sprawdzamszlak-frontend sprawdzamszlak-frontend
ln -s ../sprawdzamszlak-infrastructure sprawdzamszlak-infrastructure
# (dostosuj ścieżki do swojego setupu)

# Inicjalizuj git (do późniejszej migracji)
git init
git add CLAUDE.md README.md .claude/
git commit -m "chore: initial claude code setup"

# Odpal Claude Code
claude
```

Claude automatycznie wczyta `CLAUDE.md`, agentów i commands. Auditor będzie mógł patrzeć na oba repo przez symlinki.

**Alternatywnie:** wrzuć `CLAUDE.md` + `.claude/` do `sprawdzamszlak-frontend` i pracuj stamtąd, podając audytorowi ścieżkę do drugiego repo.

## Zawartość paczki

```
sprawdzamszlak/
├── CLAUDE.md                    ← główny kontekst (przeczytaj!)
├── README.md                    ← ten plik
└── .claude/
    ├── settings.json            ← permissions
    ├── agents/
    │   ├── auditor.md           ← read-only audyt obu repo
    │   ├── architect.md         ← decyzje stack/struktura, ADR
    │   ├── aws-infra.md         ← Terraform, Lambda, DDB, IAM
    │   ├── security.md          ← OAuth, sekrety, IAM, CSP
    │   ├── frontend-designer.md ← UI, landing, mapa
    │   ├── integrator.md        ← Strava/Garmin
    │   └── reviewer.md          ← review przed commitem
    └── commands/
        ├── audyt.md             ← /audyt
        ├── migracja-monorepo.md ← /migracja-monorepo
        ├── security-check.md    ← /security-check
        ├── nowa-funkcja.md      ← /nowa-funkcja
        └── release.md           ← /release
```

## Sugerowana ścieżka (zgodna z Twoim rankingiem priorytetów)

### Krok 1: Audyt
```
/audyt
```
`auditor` przejdzie przez **oba repo**, da raport. Niczego nie zmieni. Dostaniesz mapę tego co masz + ranking ryzyk.

### Krok 2: Architektura — pierwszy ADR
```
@architect Na podstawie raportu audytora napisz ADR 0001 porównujący opcje stacku (zostajemy na AWS / migracja na VPS+Postgres / hybryda) z konkretnymi liczbami (koszty, czas migracji) i rekomendacją.
```
Dostajesz konkretną decyzję poparta liczbami. Akceptujesz lub kwestionujesz.

### Krok 3: Security pass (na obecnym stanie)
```
/security-check
```
Niezależnie od decyzji o stacku — naprawiamy 🚨 critical *teraz*. Sekrety w git history, public S3 buckets, IAM `*` itd.

### Krok 4: Migracja do monorepo
```
/migracja-monorepo
```
Wieloetapowy workflow z `architect` + `aws-infra`. Zachowuje historię git, wydziela kod Lambdy z Terraforma, ustawia `apps/` + `packages/` + `infrastructure/`.

### Krok 5+: Funkcje
```
/nowa-funkcja Landing page z hero-mapą i scroll storytellingiem
/nowa-funkcja OAuth flow Stravy + zapis tokenów (encrypted)
/nowa-funkcja Webhook handler Stravy z idempotencją (SQS lub async invoke)
```

## Wołanie agentów ręcznie

Slash commands automatyzują workflow, ale możesz wołać agentów bezpośrednio:

```
@auditor zweryfikuj czy moduł integrations/strava jest spójny ze schematem DDB
@frontend-designer pokaż 2 koncepcje hero sekcji landingu, jedna z fly-to po Tatrach
@aws-infra zaprojektuj single-table design w DynamoDB dla activities + tracks + tokens
@integrator zaimplementuj refresh token flow z rotacją
@security review tego endpointu /api/webhooks/strava + powiązanych IAM policies
@reviewer przeczytaj diff i powiedz czy mogę commitować
```

## Co zostało celowo pominięte

- **CI/CD config** — zrobimy gdy `architect` zdecyduje gdzie hostujemy frontend i jak deployujemy backend
- **Testing setup** — zależy od decyzji o frameworku (Vitest? Playwright?)
- **Sentry / monitoring** — przed pierwszym publicznym deployem

To trafi do `architect` jako część planu architektonicznego.

## Modyfikacje

CLAUDE.md i agenty są **żywymi dokumentami**. Edytuj jak projekt ewoluuje:
- Nowe konwencje? → `CLAUDE.md`
- Subagent powinien wiedzieć o nowym wzorcu? → odpowiedni `.md` w `agents/`
- Nowy częsty workflow? → nowy slash command

## Uwagi o sekretach i Terraformie

`.claude/settings.json` blokuje:
- Czytanie/edycję `.env*`, `*.tfvars`, `terraform.tfstate*`
- `terraform apply -auto-approve` (musi być świadomy)
- `git push --force`
- `rm -rf /`, fetch | sh patterns

Pyta przed:
- `terraform apply` (bez `-auto-approve`)
- `aws *` CLI commands
- `git push`, `merge`, `reset`
- `WebFetch`

Pozwala bez pytania:
- `terraform plan`, `validate`, `fmt`, `init`
- Wszystkie operacje read-only na git i AWS state

To są sensowne defaulty, ale zmień jak chcesz.
