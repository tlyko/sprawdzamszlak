# sprawdzamszlak.pl

A personal logbook of mountain trips, mostly in the Tatras: marked trails, off-trail routes, ski touring and climbing. Activities flow from Strava onto the map automatically, and the site turns them into a log with stats, peaks and progress on the Crown of the Tatras (Wielka Korona Tatr).

- Site: [sprawdzamszlak.pl](https://sprawdzamszlak.pl)
- Preview: `sprawdzamszlak.tlyko94.workers.dev`

## What's on the site

| Path | Content |
|---|---|
| `/` | trip log: list with filters and year groups next to the map, clicking a trip flies the map to it |
| `/trasy/[slug]/` | trip details: elevation profile, Strava photos, GPX download, sharing |
| `/szczyty/[slug]/` | peak page (catalog of ~320 peaks from OSM and Wikipedia) with search |
| `/korona-tatr` | Crown of the Tatras progress |
| `/statystyki` | "year in numbers" |
| `/plany/` | planned trips (public list) |
| `/plany/admin/` | plan editing, behind Cloudflare Access |
| `/strava`, `/strava/connected` | connecting a Strava account |
| `/o-projekcie` | about the project |

## Architecture

```
 Browser
   └─ sprawdzamszlak.pl ── Cloudflare Worker ─┬─ static Next.js export (assets)
                                              └─ /api/* ──► AWS API Gateway ──► Lambda (Node, TS) ──┬─► DynamoDB
                                                                                                    ├─► S3 (route GeoJSON)
 Strava ── webhook ──► API Gateway ──► Lambda ──► DynamoDB (events) ── Stream ──► fetcher Lambda ────┘
```

- **Frontend:** Next.js 16 (`output: 'export'`), React, Leaflet with Stadia Maps tiles (OSM as fallback)
- **Edge:** a Cloudflare Worker (`apps/web/worker/index.ts`) serves static files, proxies `/api/*` to AWS and serves shells for the dynamic `/trasy/*` and `/szczyty/*` paths
- **Backend:** two TypeScript Lambdas:
  - `sprawdzamszlak-app` handles the API, OAuth and the Strava webhook
  - `sprawdzamszlak-app-fetcher` is triggered by a DynamoDB Stream, fetches the activity and its streams from Strava, builds GeoJSON and writes it to S3 and DynamoDB
- **Data:** DynamoDB (peaks, routes, plans, OAuth states, webhook events with TTL), S3 (`trails/strava_{id}.geojson`)
- **Admin auth:** Cloudflare Access (magic link), and the Lambda verifies the CF Access JWT as well
- **Secrets:** SSM Parameter Store (Strava tokens and keys, CF Access config)
- **IaC:** Terraform with an S3 + DynamoDB backend, applied from GitHub Actions via AWS OIDC
- **Costs:** AWS Budget of $1/month and Cost Anomaly Detection

Only `Hike`, `Walk`, `RockClimbing`, `BackcountrySki` and `AlpineSki` activities are imported. A heuristic assigns each route one of five types: marked trail, off-trail, walk, ski tour, climbing.

Architecture decisions live in [`docs/adr/`](docs/adr/):

| ADR | Topic |
|---|---|
| [001](docs/adr/ADR-001-stack-and-monorepo.md) | Stack and monorepo: stay on AWS, TypeScript, pnpm workspaces |
| [002](docs/adr/ADR-002-admin-panel-auth.md) | Admin panel auth (superseded by 007/008) |
| [003](docs/adr/ADR-003-strava-oauth-and-webhook.md) | Strava OAuth and webhook, idempotency |
| [004](docs/adr/ADR-004-gpx-parser-and-s3-layout.md) | GPX parser and S3 layout |
| [005](docs/adr/ADR-005-tfc-to-gha-oidc-migration.md) | Terraform Cloud → GitHub Actions + OIDC |
| [007](docs/adr/ADR-007-strava-oauth-start-page.md) | Strava OAuth start page, CSRF model |
| [008](docs/adr/ADR-008-plans-feature-and-cf-access.md) | Planned trips and Cloudflare Access |

## Repository layout

```
sprawdzamszlak/
├── apps/
│   ├── web/               ← Next.js + Cloudflare Worker (worker/)
│   └── api/               ← Lambdas: src/ (handler, strava/, admin/, auth/), scripts/ (CLI), seeds/
├── packages/
│   └── shared/            ← types shared by web and api
├── infrastructure/
│   ├── terraform/         ← Lambda, DynamoDB, S3, IAM, CI/CD, budgets
│   └── scripts/           ← manual setup instructions (CF Access)
├── scripts/               ← migration scripts from the two-repo era (W1–W3, TFC → S3 state)
├── docs/                  ← ADRs, audit, design proposal
├── wrangler.jsonc         ← Worker config
├── PROJECT-STATUS.md      ← current state, open tasks, useful commands
└── CLAUDE.md              ← conventions and working rules
```

The `sprawdzamszlak-frontend/` and `sprawdzamszlak-infrastructure/` directories are leftovers from the old separate repos, which are now archived. All current code is in `apps/` and `infrastructure/`.

## Running locally

Requirements: Node 22 (`.nvmrc`), pnpm via corepack, AWS CLI with SSO for scripts that touch production.

```bash
corepack enable
pnpm install
cp .env.example .env              # fill it in; set NEXT_PUBLIC_USE_OSM=true in apps/web/.env.local

pnpm dev:web                      # http://localhost:3000
pnpm -F @sprawdzamszlak/api build # Lambda bundles → apps/api/dist
pnpm -r test                      # vitest in api and web
pnpm typecheck
```

### Operational scripts (`apps/api`)

| Command | What it does |
|---|---|
| `pnpm -F @sprawdzamszlak/api seed` | loads peaks and other data from `seeds/` into DynamoDB |
| `… import:osm-peaks`, `… polonize:peaks` | imports peaks from OSM and converts names to Polish |
| `… strava:subscribe` / `strava:unsubscribe` | creates or removes the Strava webhook subscription |
| `… strava:replay <id>` / `strava:replay-many <id…>` | reprocesses an activity with a synthetic webhook |
| `… strava:drop-manual-seeds [--dry-run]` | removes routes that were added by hand (not from Strava) |

These scripts run against production AWS, so log in with `aws sso login` first.

## Deployment and CI

| Workflow | When | What it does |
|---|---|---|
| `Test` | PRs and `main` (changes in `apps/`, `packages/`) | vitest in api and web |
| `Terraform` | PR: `plan`, `main`: `apply` | builds the Lambdas and applies infrastructure via AWS OIDC |
| `Smoke` | daily at 06:15 UTC | curls the home page, `/api/`, `/api/routes` and a peak page |

The frontend is built by Cloudflare Workers Builds: `main` goes to production, other branches to preview.

## Rules

The full list is in [`CLAUDE.md`](CLAUDE.md). In short:

- Changes go through PRs from a branch, never straight to `main`
- Terraform is applied only from CI; locally we run `plan`
- Secrets live in SSM, never in the repo or in a committed `.env`
- Endpoints validate input, the webhook is idempotent, and the frontend never touches Strava tokens
