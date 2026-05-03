# Project status snapshot — 2026-05-03 evening

Living document — overwritten when significant state changes. Read this first after `/clear`.

## Where we are

| Milestone | Status |
|---|---|
| W1 — monorepo extract from two source repos | ✅ shipped |
| W2 — TS rewrite of Lambda + DDB seed migration off Terraform | ✅ shipped |
| W2 hotfix — Lambda nodejs22.x ESM `dist/package.json` | ✅ shipped |
| Frontend on Cloudflare Workers + Static Assets (`output:'export'`) | ✅ live at sprawdzamszlak.pl + sprawdzamszlak.tlyko94.workers.dev |
| ADR-005 — Terraform Cloud → S3+DDB backend + GitHub Actions OIDC | ✅ migrated, first GHA-driven apply succeeded |
| Cost monitoring | ✅ AWS Budget $1/m + Cost Anomaly Detection daily |
| W3 (admin panel + GPX upload) — original scope | ❌ retracted (see "Decisions made" below) |
| W4 — Strava OAuth + webhook integration | 🟡 next milestone, deadline 2026-06-15 |

## Open PRs

None — main is current, all open work merged or closed.

## Decisions made

### Admin panel retracted from W3
PR #21 (chore(w3): admin panel + GPX upload endpoint) was closed without merging. Reason after re-eval with owner:

- New activities flow through Strava webhook (W4) automatically
- Historical GPX already manually imported pre-W2
- Manual edits go through git: edit `apps/api/seeds/*.json` → push → GHA `terraform apply`
- Edge case "Strava didn't capture, I have a Garmin GPX" hits maybe 2-3× a year — overkill to build a browser admin panel for that

Path forward when those edge cases come up:
- Build a small **CLI script** (`apps/api/scripts/upload-gpx.ts`) that authenticates via owner's AWS SSO and writes directly to S3 + DDB. No shared secret, no public endpoint.

Proper browser admin panel is **post-season backlog** (after 2026-06-15). When it comes back:
- Auth via Cloudflare Access (Zero Trust) rather than HTTP Basic
- Or AWS IAM SigV4 if CLI-only access is enough
- ADR-002 will be re-opened or a new ADR-007 written then.

### Other architectural commitments (from ADRs)
- **ADR-001** Option A modified: stay on AWS (Lambda + DDB + S3 + API GW), TS instead of Python, monorepo via pnpm workspaces.
- **ADR-003** Strava webhook: Parameter Store SecureString for tokens, async hand-off via DDB Streams + fetcher Lambda, idempotency via conditional PutItem on `event_id`. Sport_type allow-list `SPORT_TYPE_ALLOWLIST` lives in `packages/shared`: `Hike`/`Walk`/`RockClimbing`/`BackcountrySki`/`AlpineSki`.
- **ADR-004** GPX parser: `@tmcw/togeojson` + `@xmldom/xmldom` shim. SAFE_FILENAME regex shared between admin upload and Strava import.
- **ADR-005** GHA + S3+DDB backend with AWS OIDC; TFC workspace decommissioned manually after first successful GHA apply.
- **ADR-007** Strava OAuth start page: public static page on `apps/web/strava` + two API routes (`/strava/oauth/start` mints CSRF state in DDB, `/strava/oauth/callback` validates state, exchanges code, stores tokens in Parameter Store). Web layer never touches tokens.

## Next milestone — W4 Strava integration (deadline 2026-06-15)

Per ADR-001 sprint plan:

- W4 (2026-05-23 → 2026-05-29): OAuth flow + webhook subscription + token storage
- W5 (2026-05-30 → 2026-06-05): event handler E2E (signature/idempotency/refresh/streams → S3+DDB)
- W6 (2026-06-06 → 2026-06-13): soak time, bug fixes

W4 components to build:
1. Lambda routes: `GET /strava/oauth/start`, `GET /strava/oauth/callback`, `GET /strava/webhook` (subscription handshake), `POST /strava/webhook` (events). See ADR-007 for the OAuth pair.
2. Token storage: SSM Parameter Store SecureString.
3. DDB tables: `sprawdzamszlak-strava-events` (idempotency, ADR-003) and `sprawdzamszlak-strava-oauth-states` (CSRF nonces, 10-min TTL, ADR-007).
4. DDB Streams trigger on the events table → second Lambda (fetcher) for the heavy GPX-pull work.
5. Static pages on `apps/web`: `/strava` (connect button) and `/strava/connected` (status banner from `?status=ok|error`).
6. CLI helper `pnpm -F api strava:subscribe` to register the webhook subscription with Strava.

Pre-W4 housekeeping (done 2026-05-03):
- ✅ `SPORT_TYPE_ALLOWLIST` re-ported to `packages/shared/src/index.ts`.
- ✅ ADR-002 marked Superseded by ADR-007.
- ✅ ADR-007 written; ADR-003 D5 narrowed to point at it.

## Operational items still open

- TFC workspace `sprawdzamszlak-org/sprawdzamszlak-infrastructure` — still exists as a backup; force-delete from TFC dashboard once a few days of GHA-driven applies pass cleanly.
- TFC token in `~/.terraform.d/credentials.tfrc.json` — can be revoked from TFC after workspace deletion.
- `/tmp/sprawdzamszlak-tfstate-*.tfstate` and `/tmp/config.tf.s3-backend.backup` — local backups from migration; safe to delete after a week.
- Dependabot — enabled by owner; expect auto-PRs for npm + Actions + Terraform provider versions.

## Repos

- `tlyko/sprawdzamszlak` (this monorepo, private)
- `tlyko/sprawdzamszlak-frontend` — archived
- `tlyko/sprawdzamszlak-infrastructure` — archived

## Live URLs

- Frontend: `https://sprawdzamszlak.pl` (custom domain) + `https://sprawdzamszlak.tlyko94.workers.dev` (workers.dev preview)
- API: `https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod`
- Routes: `GET /` (peaks), `GET /routes` (with presigned S3 URLs), all returning JSON

## Useful CLI

```bash
# Smoke test API
curl -s https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/ | jq 'length'

# Smoke test routes endpoint
curl -s https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/routes | jq 'length'

# Re-seed DDB from JSON (after a destructive accident)
corepack pnpm -F @sprawdzamszlak/api seed

# Build apps/api Lambda bundle
corepack pnpm -F @sprawdzamszlak/api build

# Frontend dev server
corepack pnpm -F sprawdzamszlak-frontend dev
```
