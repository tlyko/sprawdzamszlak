# sprawdzamszlak.pl

Osobisty dziennik wyjść górskich, głównie w Tatrach: szlaki, wyjścia pozaszlakowe, skitury i wspinanie. Aktywności same trafiają ze Stravy na mapę, a strona zbiera je w kronikę ze statystykami, szczytami i postępem w Wielkiej Koronie Tatr.

- Strona: [sprawdzamszlak.pl](https://sprawdzamszlak.pl)
- Preview: `sprawdzamszlak.tlyko94.workers.dev`

## Co jest na stronie

| Ścieżka | Zawartość |
|---|---|
| `/` | dziennik wyjść: lista z filtrami i grupami według roku obok mapy, kliknięcie przybliża trasę |
| `/trasy/[slug]/` | szczegóły wyjścia: profil wysokości, zdjęcia ze Stravy, pobieranie GPX, udostępnianie |
| `/szczyty/[slug]/` | strona szczytu (katalog ~320 szczytów z OSM i Wikipedii) z wyszukiwarką |
| `/korona-tatr` | postęp w Wielkiej Koronie Tatr |
| `/statystyki` | „rok w liczbach” |
| `/plany/` | planowane wyjścia (lista publiczna) |
| `/plany/admin/` | edycja planów, za Cloudflare Access |
| `/strava`, `/strava/connected` | podłączenie konta Stravy |
| `/o-projekcie` | o projekcie |

## Architektura

```
 Przeglądarka
   └─ sprawdzamszlak.pl ── Cloudflare Worker ─┬─ statyczny eksport Next.js (assets)
                                              └─ /api/* ──► AWS API Gateway ──► Lambda (Node, TS) ──┬─► DynamoDB
                                                                                                    ├─► S3 (GeoJSON tras)
 Strava ── webhook ──► API Gateway ──► Lambda ──► DynamoDB (events) ── Stream ──► Lambda fetcher ────┘
```

- **Frontend:** Next.js 16 (`output: 'export'`), React, Leaflet z kafelkami Stadia Maps (OSM jako fallback)
- **Edge:** Cloudflare Worker (`apps/web/worker/index.ts`) serwuje statyczne pliki, przekazuje `/api/*` do AWS i podstawia shelle dla dynamicznych ścieżek `/trasy/*` i `/szczyty/*`
- **Backend:** dwie Lambdy w TypeScript:
  - `sprawdzamszlak-app` obsługuje API, OAuth i webhook Stravy
  - `sprawdzamszlak-app-fetcher` jest wyzwalana przez DynamoDB Stream, pobiera aktywność i streamy ze Stravy, buduje GeoJSON i zapisuje go do S3 i DynamoDB
- **Dane:** DynamoDB (szczyty, trasy, plany, stany OAuth, zdarzenia webhooka z TTL), S3 (`trails/strava_{id}.geojson`)
- **Auth panelu:** Cloudflare Access (magic link), a Lambda dodatkowo weryfikuje JWT z CF Access
- **Sekrety:** SSM Parameter Store (tokeny i klucze Stravy, konfiguracja CF Access)
- **IaC:** Terraform z backendem S3 i DynamoDB, apply przez GitHub Actions z AWS OIDC
- **Koszty:** AWS Budget $1/mies. i Cost Anomaly Detection

Importowane są tylko aktywności typu `Hike`, `Walk`, `RockClimbing`, `BackcountrySki` i `AlpineSki`. Heurystyka przypisuje każdej trasie jeden z pięciu typów: szlak, pozaszlakowa, spacer, skitur, wspinaczka.

Decyzje architektoniczne są w [`docs/adr/`](docs/adr/):

| ADR | Temat |
|---|---|
| [001](docs/adr/ADR-001-stack-and-monorepo.md) | Stack i monorepo: zostajemy na AWS, TypeScript, pnpm workspaces |
| [002](docs/adr/ADR-002-admin-panel-auth.md) | Auth panelu admina (zastąpiony przez 007/008) |
| [003](docs/adr/ADR-003-strava-oauth-and-webhook.md) | OAuth i webhook Stravy, idempotencja |
| [004](docs/adr/ADR-004-gpx-parser-and-s3-layout.md) | Parser GPX i układ S3 |
| [005](docs/adr/ADR-005-tfc-to-gha-oidc-migration.md) | Terraform Cloud → GitHub Actions + OIDC |
| [007](docs/adr/ADR-007-strava-oauth-start-page.md) | Strona startowa OAuth Stravy, model CSRF |
| [008](docs/adr/ADR-008-plans-feature-and-cf-access.md) | Planowane wyjścia i Cloudflare Access |

## Struktura repo

```
sprawdzamszlak/
├── apps/
│   ├── web/               ← Next.js + Cloudflare Worker (worker/)
│   └── api/               ← Lambdy: src/ (handler, strava/, admin/, auth/), scripts/ (CLI), seeds/
├── packages/
│   └── shared/            ← typy wspólne dla web i api
├── infrastructure/
│   ├── terraform/         ← Lambda, DynamoDB, S3, IAM, CI/CD, budżety
│   └── scripts/           ← instrukcje ręcznej konfiguracji (CF Access)
├── scripts/               ← skrypty migracji z czasów dwóch repo (W1–W3, stan TFC → S3)
├── docs/                  ← ADR-y, audyt, propozycja designu
├── wrangler.jsonc         ← konfiguracja Workera
├── PROJECT-STATUS.md      ← bieżący stan, otwarte zadania, przydatne komendy
└── CLAUDE.md              ← konwencje i zasady pracy
```

Katalogi `sprawdzamszlak-frontend/` i `sprawdzamszlak-infrastructure/` to pozostałości po dawnych osobnych repo, które są dziś zarchiwizowane. Cały aktualny kod jest w `apps/` i `infrastructure/`.

## Uruchomienie lokalne

Wymagania: Node 22 (`.nvmrc`), pnpm przez corepack, AWS CLI z SSO dla skryptów operujących na produkcji.

```bash
corepack enable
pnpm install
cp .env.example .env              # uzupełnij; w apps/web/.env.local ustaw NEXT_PUBLIC_USE_OSM=true

pnpm dev:web                      # http://localhost:3000
pnpm -F @sprawdzamszlak/api build # paczki Lambd → apps/api/dist
pnpm -r test                      # vitest w api i web
pnpm typecheck
```

### Skrypty operacyjne (`apps/api`)

| Komenda | Co robi |
|---|---|
| `pnpm -F @sprawdzamszlak/api seed` | ładuje szczyty i inne dane z `seeds/` do DynamoDB |
| `… import:osm-peaks`, `… polonize:peaks` | import szczytów z OSM i spolszczenie nazw |
| `… strava:subscribe` / `strava:unsubscribe` | zakłada lub usuwa subskrypcję webhooka Stravy |
| `… strava:replay <id>` / `strava:replay-many <id…>` | ponownie przetwarza aktywność syntetycznym webhookiem |
| `… strava:drop-manual-seeds [--dry-run]` | usuwa trasy dodane ręcznie (nie ze Stravy) |

Skrypty działają na produkcyjnym AWS, więc przed ich uruchomieniem trzeba się zalogować przez `aws sso login`.

## Deploy i CI

| Workflow | Kiedy | Co robi |
|---|---|---|
| `Test` | PR i `main` (zmiany w `apps/`, `packages/`) | vitest w api i web |
| `Terraform` | PR: `plan`, `main`: `apply` | buduje Lambdy i aplikuje infrastrukturę przez AWS OIDC |
| `Smoke` | codziennie 06:15 UTC | curl na stronę główną, `/api/`, `/api/routes` i stronę szczytu |

Frontend budują Workers Builds w Cloudflare: `main` trafia na produkcję, pozostałe branche na preview.

## Zasady

Pełna lista jest w [`CLAUDE.md`](CLAUDE.md). W skrócie:

- Zmiany idą przez PR z brancha, nie bezpośrednio do `main`
- Terraform aplikuje się tylko z CI, lokalnie uruchamiamy `plan`
- Sekrety trzymamy w SSM, nigdy w repo ani w `.env` w gicie
- Endpointy walidują wejście, webhook jest idempotentny, a frontend nigdy nie dotyka tokenów Stravy
