# Project status snapshot — 2026-05-05 night

Living document — overwritten when significant state changes. Read this first after `/clear`.

> **🟢 START HERE — manual setup pending:** ADR-008 (planner) shipped end-to-end in code (PRs #64–#76 all merged), but the live `/plany/admin/` write flow is gated by **one-time owner action** that hasn't happened yet:
>
> 1. **CF Access app** — Zero Trust → Add → **Self-hosted and private**. Destinations: `sprawdzamszlak.pl/api/admin/*` AND `sprawdzamszlak.pl/plany/admin/*`. Policy: Allow, Email = `tlyko94@gmail.com`. Full steps in [`infrastructure/scripts/cf-access-setup.md`](infrastructure/scripts/cf-access-setup.md) Faza B.
> 2. **SSM populate** with the values from above:
>    ```bash
>    aws ssm put-parameter --region eu-west-1 --overwrite \
>      --name /sprawdzamszlak/cf-access/team_domain --type String \
>      --value 'sprawdzamszlak.cloudflareaccess.com'
>    aws ssm put-parameter --region eu-west-1 --overwrite \
>      --name /sprawdzamszlak/cf-access/aud --type String \
>      --value '<aud-z-overview-apki>'
>    ```
> 3. **CF DNS cleanup** — delete two leftover records from the dropped api.sprawdzamszlak.pl arch: `api → ...` (proxied) and `_xxx.api → ...acm-validations.aws.` (gray cloud).
>
> After (1)+(2) Lambda cold start (~5 min) refreshes config; `/plany/admin/` then accepts magic-link login + checkbox toggles persist.
>
> The pre-ADR-008 audit ([`docs/audit-2026-05-05.md`](docs/audit-2026-05-05.md)) — Sprint 1 from that doc was fully shipped today; §5.1 (notes), §5.6 (observability), §5.10 (smoke cron) and rest still open as future work.

## Where we are

| Milestone | Status |
|---|---|
| W1 — monorepo extract | ✅ shipped |
| W2 — TS rewrite of Lambda + DDB seed migration off Terraform | ✅ shipped |
| Frontend on Cloudflare Workers + Static Assets (`output:'export'`) | ✅ live |
| ADR-005 — Terraform Cloud → S3+DDB + GHA OIDC | ✅ migrated |
| Cost monitoring | ✅ AWS Budget $1/m + Cost Anomaly Detection |
| W3 (admin panel + GPX upload) | ❌ retracted (see ADR-002 superseded) |
| **W4 — Strava OAuth + webhook + fetcher** (deadline was 2026-06-15) | **✅ shipped 6 weeks early — 2026-05-04** |
| Security backlog (#1–#7) | ✅ all closed |
| Direction B redesign — PR 1 chrome | ✅ shipped |
| Direction B redesign — PR 2 cartographic pass (Stadia tiles, peak markers, trail styles) | ✅ shipped |
| Direction B redesign — PR 3 logbook layout (list + persistent map, click-to-fly) | ✅ shipped |
| Direction B redesign — PR 4 trip detail panel + elevation profile + GPX download | ✅ shipped |
| Direction B redesign — PR 5 peak pages + /o-projekcie + Strava restyle | ✅ shipped |
| Bulk reseed (replace 12 manual seeds with Strava-imported equivalents) | ✅ done — 17 strava-* routes live, 0 manual seeds |
| Sport_type heuristic (5 trail types: official/off-piste/walk/ski-tour/climbing) | ✅ shipped |
| #45 statystyki "rok w liczbach" | ✅ shipped (PR #54) |
| #46 logbook filter pills + sticky year groups | ✅ shipped (PR #55) |
| #47 OG meta + share button | ✅ shipped (PR #56) |
| #48 Wielka Korona Tatr tracker | ✅ shipped (PR #51 + #52 + #53 deep-link) |
| #49 Strava photos w trip detail | ✅ shipped (PR #58, awaits live verification — replay activity z fotkami) |
| Bonus: peak height obok nazwy w row | ✅ shipped (PR #57) |
| Bonus: type-override map (Hike→official dla 6 tras) | ✅ shipped (część PR #55) |
| **Sprint 1 z audytu 2026-05-05 (6 hot fixes)** | ✅ shipped (PRs #60–#63) |
| **ADR-008 — planner (`/plany/`) z auth via Cloudflare Access** | ✅ code shipped (#64–#76); live waits on owner CF Access app + SSM populate |
| Peaks catalog: 24 → ~320 (OSM+Wiki import) | ✅ shipped (PR #70 + owner ran `seed`) |
| API restructure: drop api subdomain, route via Worker proxy | ✅ shipped (PR #73) |

## Open PRs

`gh pr list` — empty as of 2026-05-05 night. Ostatnia merga: `fix/peak-detail-slug-and-tier` (#76).

## Active feature backlog

**ADR-008 track zamknięty w kodzie.** Owner manual setup pending — zob. "START HERE" wyżej.

Po skonfigurowaniu CF Access + SSM, kolejne źródła zadań:

- **`docs/audit-2026-05-05.md` §6 (sprint roadmap)** — Sprint 1 zrobiony. Sprint 2 (quality polish: tests, observability, mapa polish), Sprint 3 (kronika != log: §5.1 notatki, §5.2 sezon/warunki, §5.3 partnerzy, §5.8 WKT jako narracja), Sprint 4 (WIG tile layer, RSS export).
- **Manual cleanup** still pending:
  - 2 leftover CF DNS records (`api → ...` proxied + `_xxx.api → ...acm-validations.aws.` gray cloud) from the dropped api subdomain
  - 2 mystery `strava-*` rows in DDB (`strava-11550083200`, `strava-12161135830`)
  - Stadia free trial expires 2026-05-18 — payment method needed
  - TFC workspace + token rotation (post-ADR-005 backup safety net)

`gh issue list --repo tlyko/sprawdzamszlak --state open` — currently empty.

## W4 — what landed (Strava integration)

Three slices, all merged + deployed.

### Slice A — OAuth (PR #23)
- `GET /strava/oauth/start` mints CSRF state in DDB, 302 to Strava authorize.
- `GET /strava/oauth/callback` validates state, exchanges code, writes tokens to Parameter Store SecureString at `/sprawdzamszlak/strava/tokens`.
- Static pages: `/strava` (connect button) + `/strava/connected` (status banner — restyled in PR #42).
- DDB table `sprawdzamszlak-strava-oauth-states` with TTL 10 min.

### Slice B — Webhook subscription (PR #25)
- `GET /strava/webhook` (handshake — echo `hub.challenge` if `verify_token` matches).
- `POST /strava/webhook` (zod-validate, conditional PutItem, always 200; <2s budget).
- DDB table `sprawdzamszlak-strava-events` with TTL 7d + DDB Streams (`NEW_IMAGE`).
- Owner CLIs: `pnpm -F api strava:subscribe` / `:unsubscribe`. Subscription id stored at `/sprawdzamszlak/strava/subscription_id`.

### Slice C — Fetcher Lambda (PR #29) + bugfix (PR #36)
- Second Lambda `sprawdzamszlak-app-fetcher` (handler `strava/fetcher-handler.handler`, 30s timeout).
- Triggered by DDB Stream on the events table (`starting_position = LATEST`).
- Refresh token if `expires_at - now < 60s`, GET activity + streams (with `key_by_type=true` after #36 fix), filter by `SPORT_TYPE_ALLOWLIST`, build GeoJSON LineString with `[lng, lat, alt]`, PUT S3 `trails/strava_{id}.geojson` + DDB row `id=strava-{id}`. Type derived from `sport_type` via `sportTypeToRouteType()` (PR #43).
- 404 on Strava → silent. `aspect_type=delete` → log + skip. Per-record try/catch.

### Bulk reseed CLIs (PR #44)
- `pnpm -F api strava:replay-many <id1> <id2> ...` — bulk synthetic webhooks.
- `pnpm -F api strava:drop-manual-seeds [--dry-run]` — drops everything in routes table not starting with `strava-`. Confirmation prompt.

## Direction B redesign — what landed

| PR | Branch | Touches |
|---|---|---|
| #28 | feat/design-tokens-and-chrome | tokens, Fraunces, header/footer |
| #32 | feat/cartographic-pass | Stadia tiles, peak markers, trail styles, component split |
| #35 | feat/logbook-home | logbook two-column layout, click-to-fly |
| #37 | fix/peak-label-polish | peak label contrast + declutter (LATER REVERTED in #39) |
| #38 | feat/trip-detail | trip detail panel, elevation profile SVG, GPX download |
| #39 | fix/peak-markers-dots-only | drop pill labels, peak popups via click |
| #41 | chore/wrangler-spa-fallback | `not_found_handling: single-page-application` |
| #42 | feat/peak-pages-and-strava-restyle | /szczyty/[slug]/, /o-projekcie/, restyle /strava/* |
| #43 | feat/sport-type-heuristic | RouteType enum 2→5, sport_type → route type mapping |

Design proposal lives at `docs/design-proposal.md`. Palette exploration brief (for owner's claude.ai/design iteration if they want a refresh) at `docs/design-brief-palette-explore.md`.

## Owner E2E test (already done)

Strava activity recorded → webhook → fetcher → S3 + DDB → mapa, end-to-end verified 2026-05-04 morning. Replay CLI works (`pnpm -F api strava:replay <id>`).

## Known limits / debt

- **No on-delete cleanup** — `aspect_type=delete` from Strava just logs; route stays. Owner can drop manually.
- **No DLQ** — failed fetcher invocations rely on events table TTL (7d) for replay window.
- **Static export + dynamic OG meta** — issue #47 will set OG tags client-side via `document.head` mutation. Bots see default tags pre-hydrate.
- **2 mystery strava-* routes** in DDB from earlier test runs (`strava-11550083200`, `strava-12161135830`). Owner left them; can drop with `aws dynamodb delete-item` + `aws s3 rm` if they want.
- **IAM propagation lag on multi-resource applies** — when a PR widens CICD perms AND adds a new resource that needs them, the first apply fails (assumed-role creds are stale); manual re-run via `workflow_dispatch` works. Pattern: split policy-only PRs from new-resource PRs.
- **Stadia free trial** — until 2026-05-18, owner needs to add payment method then (free tier 200k req/m, won't be charged at our scale).

## Other architectural commitments (from ADRs)

- **ADR-001** stay on AWS, TS not Python, monorepo via pnpm workspaces.
- **ADR-002** — Superseded by ADR-007.
- **ADR-003** Strava webhook + token storage + idempotency. `SPORT_TYPE_ALLOWLIST`: `Hike`/`Walk`/`RockClimbing`/`BackcountrySki`/`AlpineSki`.
- **ADR-004** GPX parser plan (currently unused — Strava streams skip the GPX layer).
- **ADR-005** GHA + S3+DDB + AWS OIDC.
- **ADR-007** Strava OAuth start page on apps/web + two API routes; web layer never touches tokens.
- **ADR-008** Plans feature with Cloudflare Access auth. Same-origin via Worker proxy (`/api/*`). One CF Access app on `sprawdzamszlak.pl` covers `/api/admin/*` and `/plany/admin/*`. Lambda re-verifies CF JWT (defense-in-depth).

## SSM parameters in use

| name | type | who writes | who reads |
|---|---|---|---|
| `/sprawdzamszlak/strava/client_id` | String | owner (CLI) | Lambda (oauth + fetcher) |
| `/sprawdzamszlak/strava/client_secret` | SecureString | owner (CLI) | Lambda (oauth + fetcher) |
| `/sprawdzamszlak/strava/verify_token` | SecureString | strava:subscribe CLI | Lambda (webhook handshake) |
| `/sprawdzamszlak/strava/tokens` | SecureString | Lambda (oauth callback + fetcher refresh) | Lambda (fetcher) |
| `/sprawdzamszlak/strava/subscription_id` | String | strava:subscribe CLI | — (informational) |
| `/sprawdzamszlak/cf-access/team_domain` | String | owner (CLI) | Lambda (`/admin/*` JWT verify) |
| `/sprawdzamszlak/cf-access/aud` | String | owner (CLI) | Lambda (`/admin/*` JWT verify) |
| `/sprawdzamszlak/admin/owner_email` | String | owner (CLI) | Lambda (`/admin/*` email allowlist) |

## Operational items still open

- TFC workspace `sprawdzamszlak-org/sprawdzamszlak-infrastructure` — still exists as backup; force-delete after a few days of GHA-driven applies pass cleanly.
- TFC token in `~/.terraform.d/credentials.tfrc.json` — can be revoked after workspace deletion.
- `/tmp/sprawdzamszlak-tfstate-*.tfstate` and `/tmp/config.tf.s3-backend.backup` — local migration backups, safe to delete.
- Dependabot enabled — expect auto-PRs.

## Repos

- `tlyko/sprawdzamszlak` (this monorepo, private)
- `tlyko/sprawdzamszlak-frontend` — archived
- `tlyko/sprawdzamszlak-infrastructure` — archived

## Live URLs

- Frontend: `https://sprawdzamszlak.pl` (custom domain) + `https://sprawdzamszlak.tlyko94.workers.dev` (preview)
- **API** — same-origin via Worker proxy at `https://sprawdzamszlak.pl/api/*` (ADR-008 PR 5b). Frontend never hits the legacy hostname directly.
- API origin (legacy, used by Worker as upstream + by Strava OAuth/webhook): `https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod`
- Public routes: `GET /api/` (peaks), `GET /api/routes` (with presigned S3 URLs), `GET /api/plans` (planner), `GET /api/strava/oauth/start`, `GET /api/strava/oauth/callback`, `GET/POST /api/strava/webhook`
- Admin routes (CF Access gated): `GET /api/admin/ping`, `POST /api/admin/plans`, `PATCH /api/admin/plans/{id}`, `DELETE /api/admin/plans/{id}`
- Frontend pages: `/`, `/plany/`, `/plany/admin/` (CF Access), `/korona-tatr`, `/statystyki`, `/o-projekcie`, `/strava`, `/strava/connected`, `/szczyty/[slug]/`, `/trasy/[slug]/`

## Useful CLI

```bash
# Smoke test API
curl -s https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/ | jq 'length'
curl -s https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/routes | jq 'length'

# Build apps/api Lambda bundle (handler.js + strava/fetcher-handler.js)
corepack pnpm -F @sprawdzamszlak/api build

# Strava CLIs (owner-run, AWS SSO)
corepack pnpm -F @sprawdzamszlak/api strava:subscribe
corepack pnpm -F @sprawdzamszlak/api strava:unsubscribe
corepack pnpm -F @sprawdzamszlak/api strava:replay <activity_id>
corepack pnpm -F @sprawdzamszlak/api strava:replay-many <id1> <id2> ...
corepack pnpm -F @sprawdzamszlak/api strava:drop-manual-seeds --dry-run

# Frontend dev server (http://localhost:3000, OSM fallback via .env.local NEXT_PUBLIC_USE_OSM=true)
corepack pnpm -F sprawdzamszlak-frontend dev

# Tail Lambda logs
aws logs tail /aws/lambda/sprawdzamszlak-app --follow
aws logs tail /aws/lambda/sprawdzamszlak-app-fetcher --follow

# Inspect tokens (post-OAuth)
aws ssm get-parameter --name /sprawdzamszlak/strava/tokens --with-decryption --region eu-west-1 --query 'Parameter.Value' --output text | jq .

# View open feature backlog
gh issue list --repo tlyko/sprawdzamszlak --state open
```
