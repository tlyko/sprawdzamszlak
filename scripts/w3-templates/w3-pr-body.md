## Summary

W3 of [ADR-001](docs/adr/ADR-001-stack-and-monorepo.md) — admin panel + GPX upload endpoint. Implements the manual upload flow described in [ADR-004](docs/adr/ADR-004-gpx-parser-and-s3-layout.md) and the auth model from [ADR-002](docs/adr/ADR-002-admin-panel-auth.md) (revised for SSG).

## What's new

### Backend (`apps/api`)
- `src/lib/auth.ts` — `requireAdmin(event)` HTTP Basic check, timing-safe compare against `ADMIN_USER` / `ADMIN_PASS` env vars
- `src/lib/multipart.ts` — minimal multipart/form-data parser (~80 LOC, zero deps)
- `src/lib/gpx.ts` — GPX → GeoJSON via `@tmcw/togeojson` + `@xmldom/xmldom` shim, merges `<trkseg>` into one LineString, drops time/HR/extensions
- `src/routes/admin-upload.ts` — 8-step ordered handler with rollback (claim slug → parse → upload → respond, with DDB delete on parse/S3 failure)
- `src/handler.ts` — dispatcher extended with `POST /admin/upload`

### Frontend (`apps/web`)
- `app/admin/page.tsx` — admin landing (links to upload)
- `app/admin/upload/page.tsx` — multipart form, browser handles 401 prompt automatically

### Shared (`packages/shared`)
- `RouteUploadInputSchema` (zod) with `STRAVA_PREFIX` collision guard
- `MAX_GPX_BYTES = 5 MB` per ADR-004
- Centralized `SLUG_REGEX`, `SAFE_FILENAME`, `FilenameSchema`

### Infrastructure (`infrastructure/terraform`)
- `lambda.tf`:
  - new `POST /admin/upload` route on the HTTP API
  - `cors_configuration.allow_methods` adds `POST`
  - `cors_configuration.allow_headers` adds `Authorization`
  - Lambda env adds `ADMIN_USER = "tomek"` and `ADMIN_PASS = var.admin_pass`
- `variables.tf` (new) — `admin_pass` sensitive variable

## How to apply (owner steps)

```bash
# 1. Generate admin password (43 random URL-safe chars), save to 1Password
export TF_VAR_admin_pass="$(openssl rand -base64 32)"
echo "$TF_VAR_admin_pass"  # copy to 1Password

# 2. Plan + apply
cd infrastructure/terraform
terraform plan
terraform apply
```

## Test after apply

```bash
# 1. /admin/upload without auth → 401
curl -i -X POST https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/admin/upload

# 2. With auth → either 400 (no body) or 200 (with valid GPX)
curl -X POST -u tomek:$TF_VAR_admin_pass \
  -F id=test_route \
  -F name='Test Route' \
  -F type=off-piste \
  -F gpx=@/path/to/file.gpx \
  https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/admin/upload
```

After successful upload:
- `apps/api/seeds/routes.json` is **not** updated (production is the source of truth now); seeds are only for re-seeding fresh tables
- The new GeoJSON is at `s3://sprawdzamszlak-trails-storage-214598715232/trails/<slug>.geojson`
- The DDB row is in `sprawdzamszlak-routes`
- Refreshing `https://sprawdzamszlak.pl` shows the new route on the map (presigned URL fetched fresh on each load)

## Security checklist (closes from security sweep)

- ✅ **H2** — body size limit (5 MB cap before parse), zod-validated input, allow-list of fields, slug regex
- ✅ **H3** — `SAFE_FILENAME` enforced before any S3 write
- ✅ **ADR-002** — basic auth gate on every admin endpoint, timing-safe compare, browser-handled prompt

Issues #2 (H2), #3 (H3) in this repo can be closed when this PR merges.

## Test plan

- [ ] `corepack pnpm install` clean (new deps: `@tmcw/togeojson`, `@xmldom/xmldom`)
- [ ] `corepack pnpm -r run typecheck` clean
- [ ] `corepack pnpm -F @sprawdzamszlak/api build` produces `dist/handler.js` (~100KB after bundling parser)
- [ ] `corepack pnpm -F sprawdzamszlak-frontend build` succeeds, `apps/web/out/admin/index.html` and `apps/web/out/admin/upload/index.html` are generated
- [ ] `terraform plan` matches expected diff (1 lambda update, 1 route added, env vars set)
- [ ] After apply: `curl -X POST /admin/upload` without auth returns 401 + WWW-Authenticate
- [ ] After apply: real GPX upload returns 200, file appears in S3, row in DDB, route visible on map after refresh

## Next: W4

Strava OAuth + webhook subscription per [ADR-003](docs/adr/ADR-003-strava-oauth-and-webhook.md). Token storage in Parameter Store. Async hand-off via DDB Streams.
