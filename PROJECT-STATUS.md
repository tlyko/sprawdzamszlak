# Project status snapshot — 2026-05-04 morning

Living document — overwritten when significant state changes. Read this first after `/clear`.

## Where we are

| Milestone | Status |
|---|---|
| W1 — monorepo extract from two source repos | ✅ shipped |
| W2 — TS rewrite of Lambda + DDB seed migration off Terraform | ✅ shipped |
| Frontend on Cloudflare Workers + Static Assets (`output:'export'`) | ✅ live |
| ADR-005 — Terraform Cloud → S3+DDB backend + GitHub Actions OIDC | ✅ migrated |
| Cost monitoring | ✅ AWS Budget $1/m + Cost Anomaly Detection daily |
| W3 (admin panel + GPX upload) — original scope | ❌ retracted |
| **W4 — Strava OAuth + webhook integration (deadline 2026-06-15)** | **✅ shipped 6 weeks early — 2026-05-04** |
| Security backlog (BACKLOG.md issues #1–#7) | ✅ all closed |
| Direction B redesign — PR 1 (foundations) | ✅ shipped |
| Direction B redesign — PR 2 (cartographic pass) | 🟡 in flight |
| Direction B redesign — PR 3 (logbook layout) | ⏳ next |
| Direction B redesign — PR 4 (trip detail + elevation) | ⏳ pending |
| Direction B redesign — PR 5 (peak pages + Strava restyle) | ⏳ pending |

## Open PRs

Check `gh pr list` — Direction B PR 2 may be open from a background frontend agent.

## W4 — what landed

Three slices, all merged + deployed.

### Slice A — OAuth (PR #23)
- `GET /strava/oauth/start` mints CSRF state in DDB, 302 to Strava authorize.
- `GET /strava/oauth/callback` validates state, exchanges code, writes tokens to Parameter Store as a SecureString JSON tuple at `/sprawdzamszlak/strava/tokens`.
- Static pages: `/strava` (connect button) + `/strava/connected` (status banner).
- DDB table `sprawdzamszlak-strava-oauth-states` with TTL 10 min.

### Slice B — Webhook subscription (PR #25)
- `GET /strava/webhook` (handshake — echo `hub.challenge` if `verify_token` matches SSM).
- `POST /strava/webhook` (zod-validate, conditional PutItem, always 200; <2s budget).
- DDB table `sprawdzamszlak-strava-events` with TTL 7d + DDB Streams (`NEW_IMAGE`).
- Owner CLIs: `pnpm -F api strava:subscribe` / `:unsubscribe`. The subscribe script auto-generates `verify_token` if absent.

### Slice C — Fetcher Lambda (PR #29)
- Second Lambda `sprawdzamszlak-app-fetcher` (handler `strava/fetcher-handler.handler`, 30s timeout).
- Triggered by DDB Stream on the events table (`starting_position = LATEST`).
- Refresh token if `expires_at - now < 60s`, GET activity + streams, filter by `SPORT_TYPE_ALLOWLIST`, build GeoJSON LineString with `[lng, lat, alt]`, PUT S3 `trails/strava_{id}.geojson` + DDB row `id=strava-{id}` `type=off-piste`.
- 404 on Strava → silent. `aspect_type=delete` → log + skip (route stays). Per-record `try/catch` so one bad event doesn't poison the batch.

## Owner E2E test (do this once, no rush)

The infra is live but no Strava activities have flowed through yet. To verify end-to-end:

1. **OAuth (one-time)**
   - Open https://sprawdzamszlak.pl/strava
   - Click "Połącz ze Stravą", consent on Strava, land on `/strava/connected?status=ok`
   - Verify: `aws ssm get-parameter --name /sprawdzamszlak/strava/tokens --with-decryption --region eu-west-1 --query 'Parameter.Value' --output text | jq .` returns `{access_token, refresh_token, expires_at, athlete_id}`.

2. **Webhook subscribe (one-time)**
   - `corepack pnpm -F api strava:subscribe` (uses local AWS SSO). Auto-generates verify_token, POSTs to Strava, stores `subscription_id` in SSM.
   - Verify Strava handshake hit our endpoint: `aws logs tail /aws/lambda/sprawdzamszlak-app --since 5m`.

3. **First import**
   - Record (or already-recorded; aspect_type=update fires) a hike/walk/climb/ski-tour activity on Strava.
   - Watch fetcher logs: `aws logs tail /aws/lambda/sprawdzamszlak-app-fetcher --follow`.
   - After ~5–10s: `curl -s https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/routes | jq 'length'` should be one higher.
   - Refresh https://sprawdzamszlak.pl — new track on the map.

If something goes wrong, the events table holds the row for 7 days; reinsert it via `aws dynamodb put-item` to replay.

## Known limits / debt

- **Sport_type → route type heuristic** — fetcher hard-codes `type: "off-piste"` for everything imported. A future change could map `BackcountrySki/AlpineSki` → its own type for distinct map styling.
- **No on-delete cleanup** — `aspect_type=delete` from Strava just logs; the route stays on the map. Owner can drop manually via DDB console if needed.
- **No DLQ** — failed fetcher invocations rely on the events table TTL (7d) for replayability.
- **`/o-projekcie` link 404s** — added by Direction B PR 1; lands in PR 5.
- **IAM propagation lag on multi-resource applies** — when a PR widens CICD perms AND adds a new resource that needs them, the first apply fails (assumed-role creds are stale); manual re-run via `workflow_dispatch` works. Pattern: split policy-only PRs from new-resource PRs to avoid this.

## Other architectural commitments (from ADRs)

- **ADR-001** Option A modified: stay on AWS (Lambda + DDB + S3 + API GW), TS instead of Python, monorepo via pnpm workspaces.
- **ADR-002** — Superseded by ADR-007 (admin panel retracted).
- **ADR-003** Strava webhook + token storage + idempotency design. `SPORT_TYPE_ALLOWLIST` lives in `packages/shared`: `Hike`/`Walk`/`RockClimbing`/`BackcountrySki`/`AlpineSki`.
- **ADR-004** GPX parser plan (currently unused — Strava streams skip the GPX layer).
- **ADR-005** GHA + S3+DDB backend with AWS OIDC.
- **ADR-007** Strava OAuth start page on `apps/web` + two API routes; web layer never touches tokens.

## SSM parameters in use

| name | type | who writes | who reads |
|---|---|---|---|
| `/sprawdzamszlak/strava/client_id` | String | owner (CLI) | Lambda (oauth + fetcher) |
| `/sprawdzamszlak/strava/client_secret` | SecureString | owner (CLI) | Lambda (oauth + fetcher) |
| `/sprawdzamszlak/strava/verify_token` | SecureString | `strava:subscribe` CLI | Lambda (webhook handshake) |
| `/sprawdzamszlak/strava/tokens` | SecureString | Lambda (oauth callback + fetcher refresh) | Lambda (fetcher) |
| `/sprawdzamszlak/strava/subscription_id` | String | `strava:subscribe` CLI | — (informational) |

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

- Frontend: `https://sprawdzamszlak.pl` (custom domain) + `https://sprawdzamszlak.tlyko94.workers.dev` (workers.dev preview)
- API: `https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod`
- Routes: `GET /` (peaks), `GET /routes` (with presigned S3 URLs), `GET /strava/oauth/start`, `GET /strava/oauth/callback`, `GET /strava/webhook`, `POST /strava/webhook`

## Useful CLI

```bash
# Smoke test API
curl -s https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/ | jq 'length'
curl -s https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/routes | jq 'length'

# Re-seed DDB from JSON (after a destructive accident)
corepack pnpm -F @sprawdzamszlak/api seed

# Build apps/api Lambda bundle (handler.js + strava/fetcher-handler.js)
corepack pnpm -F @sprawdzamszlak/api build

# Strava CLI (owner-run, AWS SSO)
corepack pnpm -F @sprawdzamszlak/api strava:subscribe
corepack pnpm -F @sprawdzamszlak/api strava:unsubscribe

# Frontend dev server
corepack pnpm -F sprawdzamszlak-frontend dev

# Tail Lambda logs
aws logs tail /aws/lambda/sprawdzamszlak-app --follow
aws logs tail /aws/lambda/sprawdzamszlak-app-fetcher --follow

# Inspect tokens (post-OAuth)
aws ssm get-parameter --name /sprawdzamszlak/strava/tokens --with-decryption --region eu-west-1 --query 'Parameter.Value' --output text | jq .
```
