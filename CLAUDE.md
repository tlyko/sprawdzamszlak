# sprawdzamszlak.pl

## Kontekst projektu

Osobista aplikacja webowa do wizualizacji aktywności górskich (głównie Tatry) — pozaszlaki, taternictwo, wspinanie. Domena: `sprawdzamszlak.pl`.

**Obecny stan (pre-migracja):**
- Dwa osobne repo: `sprawdzamszlak-frontend` (Next.js) i `sprawdzamszlak-infrastructure` (Terraform + AWS)
- Backend = Lambda functions, których kod **mieszka w katalogu Terraforma** (zapach do naprawy)
- Storage = DynamoDB + S3
- Brak integracji ze Stravą/Garminem — GPX wgrywane ręcznie

**Cel:** monorepo z czystym podziałem `apps/` + `packages/` + `infrastructure/`, integracje Strava/Garmin, dobry landing, sensowna architektura — bez nadmiernej inżynierii.

**User scope:** dziś single-user (właściciel). Projektujemy z możliwością otwarcia, ale **bez** przedwczesnej generalizacji.

## Filozofia pracy

1. **Audyt przed zmianami.** Zanim refactorujemy, rozumiemy co jest. `auditor` wchodzi pierwszy.
2. **Bezpieczeństwo > funkcje.** OAuth, sekrety, webhooki, IAM — porządnie od razu.
3. **YAGNI agresywnie.** Multi-tenant, role, billing — nie. Migracje, walidacja inputu, rate limiting — tak.
4. **Mała powierzchnia.** Każda zewnętrzna zależność i każdy nowy endpoint to dług.
5. **Solo dev mindset.** Kod ma być czytelny dla jednej osoby wracającej po 3 miesiącach przerwy.
6. **Stack to decyzja, nie założenie.** Obecnie AWS serverless. `architect` ma mandat zarekomendować zmianę (np. VPS + Postgres) jeśli koszty/DX/match-do-problemu tego wymagają. Decyzja w ADR z liczbami.

## Stack — stan obecny i kierunki

### Obecny (do zwalidowania przez `architect`)
- **Frontend:** Next.js (do potwierdzenia wersja, App Router czy Pages)
- **Backend:** AWS Lambda (Node.js)
- **Storage:** DynamoDB (metadata aktywności?), S3 (pliki GPX?)
- **API:** API Gateway (zakładamy)
- **IaC:** Terraform
- **Mapa:** TBD przez `auditor`

### Kierunki, które `architect` ma rozważyć w pierwszym ADR
**Opcja A — zostajemy na AWS, czyścimy podział**
- Wydzielenie kodu Lambdy z Terraforma do `apps/api`
- DynamoDB zostaje, ale single-table design udokumentowany
- Plus: działa, koszt minimalny, pay-per-use
- Minus: cold starts, gimnastyka z DynamoDB do geometrii, więcej tooling

**Opcja B — migracja na VPS + Postgres**
- Hetzner / Fly / Railway, Express lub Next.js API routes
- PostgreSQL + PostGIS (stworzony do geometrii)
- Plus: prostsze, lepsze do GPX/geometrii, normalne SQL, mniej warstw
- Minus: zarządzanie serwerem, koszt fixed (€5-10/mc)

**Opcja C — hybryda**
- Frontend → Vercel/Cloudflare Pages
- Backend → Fly.io / Railway / Hetzner
- Postgres managed (Neon, Supabase) lub na tym samym VPS
- Minimum AWS

ADR ma zawierać: koszty miesięczne, oszacowanie czasu migracji, które ryzyka znikają, które wchodzą.

## Planowana struktura monorepo (target)

```
sprawdzamszlak/
├── CLAUDE.md
├── README.md
├── .claude/                              ← agenty + commands
├── package.json                          ← root, pnpm workspaces
├── pnpm-workspace.yaml
├── tsconfig.base.json
│
├── apps/
│   ├── web/                              ← było: sprawdzamszlak-frontend
│   └── api/                              ← było: kod Lambdy w infrastructure
│
├── packages/
│   ├── shared/                           ← typy + zod schemas między web i api
│   └── gpx/                              ← parser/walidator GPX (jeśli własny)
│
└── infrastructure/                       ← było: sprawdzamszlak-infrastructure
    ├── terraform/                        ← TYLKO IaC, bez kodu Lambdy
    └── scripts/                          ← build & deploy
```

**Docelowy package manager:** pnpm. Workspaces, hoisting, szybkość. Można npm jeśli właściciel mocno woli.

## Domeny / podsystemy

1. **Tracks** — GPX, geometrie, metadata (typ, czas, dystans, wzniesienie)
2. **Map rendering** — kafelki, warstwy, style, klastrowanie
3. **Integrations** — Strava OAuth + webhook, Garmin via Strava auto-sync
4. **UI/Landing** — strona publiczna, scroll-driven, mapa jako bohater
5. **Auth/Sessions** — minimalnie, projektowane pod rozszerzenie
6. **Infrastructure** — Terraform / IaC / deployment (osobna domena)

## Konwencje kodu

- TypeScript strict, brak `any` bez komentarza dlaczego
- **Walidacja env zawsze przez zod** — fail fast przy starcie / cold starcie Lambdy
- Sekrety **nigdy** w repo. `.env.example` z pustymi wartościami i komentarzami.
- Sekrety w produkcji: AWS Secrets Manager / Parameter Store (dziś AWS) lub odpowiednik po migracji
- Migracje DB wersjonowane (jeśli będzie SQL)
- Każdy endpoint/handler: walidacja inputu (zod), error handling, structured log z request id
- Commits: konwencjonalne (feat/fix/chore/refactor/docs), po polsku albo angielsku — byle konsekwentnie
- Branche: `feat/*`, `fix/*`, `chore/*`. Brak commitów do `main`.

## Czego NIE robimy bez wyraźnej zgody właściciela

- Nie dodajemy zależności bez uzasadnienia (bundle size dla Lambdy = cold start tax)
- Nie zmieniamy schematu DynamoDB / DB bez migracji i ADR
- Nie commitujemy `terraform.tfstate`, `.env*`, ani niczego z `aws_access_key`
- Nie commitujemy do `main` — tylko PR z brancha
- Nie generujemy generic SaaS UI — landing musi mieć charakter
- Nie wprowadzamy Lambdy Layers / Step Functions / SQS / SNS bez konkretnej potrzeby (każda warstwa to dług)
- Nie odpalamy `terraform apply` z poziomu Claude Code bez świadomej zgody — preview tylko przez `terraform plan`

## Subagenci — kiedy co używać

- `auditor` — pierwszy kontakt z kodem, ocena stanu, mapowanie ryzyk. Read-only.
- `architect` — decyzje o strukturze, stacku, granicach modułów, schemat danych. Pisze ADR-y.
- `aws-infra` — Terraform, Lambda, DynamoDB, S3, IAM, API Gateway. Cold starts, single-table design, least privilege.
- `security` — przegląd OAuth, sekrety, walidacja, headers, CSP, webhook signatures, IAM policies
- `frontend-designer` — UI, landing, design tokens, motion, mapa jako element narracji
- `integrator` — Strava/Garmin: OAuth flow, webhooks, normalizacja danych, rate limits
- `reviewer` — czyta diff przed commitem: korelacja ze stylem, smells, test coverage

## Slash commands

- `/audyt` — pełen przegląd obu repo przez `auditor` + raport
- `/migracja-monorepo` — workflow przejścia z dwóch repo do monorepo (krok po kroku)
- `/security-check` — sweep przez `security`
- `/nowa-funkcja` — szablon: brief → architekt → impl → review
- `/release` — checklist przed deployem
