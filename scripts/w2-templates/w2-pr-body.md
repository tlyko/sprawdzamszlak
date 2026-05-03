## Summary

W2 of [ADR-001](docs/adr/ADR-001-stack-and-monorepo.md) — TypeScript rewrite of the Lambda handler with parity to the Python version, plus removal of the Terraform-managed data anti-pattern.

## What changes in this PR

### Code
- **`apps/api/src/handler.ts`** — TS rewrite with full parity vs `lambda_function.py`:
  - GET `/` → list peaks via `DynamoDBDocumentClient` `Scan` (paginated)
  - GET `/routes` → list routes + presigned S3 URLs (15 min TTL)
  - 404 default; 500 with opaque request id (security issue **H1** fixed)
- **`apps/api/scripts/seed.ts`** — one-shot loader that reads `apps/api/seeds/*.json` and writes to DDB via `BatchWriteItem` with retry. Replaces the `aws_dynamodb_table_item` anti-pattern.
- **`apps/api/seeds/peaks.json`, `apps/api/seeds/routes.json`** — extracted from `infrastructure/terraform/locals.tf`. Type for `krywan_gpx` corrected from invalid `"piste"` to `"official"` (frontend was already treating it as such because the only `off-piste` branch was hit anyway).
- **`packages/shared/src/index.ts`** — `PeakSchema`, `RouteSchema`, `RouteWithUrlSchema`, `SAFE_FILENAME` (security issue **H3** baked in), placeholder `StravaActivitySchema` for W4.
- **`apps/api/build.ts`** — unchanged from W1 stub; already externalises `@aws-sdk/*` so the bundle size stays small (~15 KB).

### Infrastructure (`infrastructure/terraform/`)
- **`lambda.tf`**:
  - `data.archive_file.lambda_zip.source_dir` → `${path.module}/../../apps/api/dist`
  - `runtime` → `nodejs22.x`
  - `handler` → `handler.handler`
- **`dynamodb.tf`**: drop `aws_dynamodb_table_item.peaks` and `.routes` resources
- **`locals.tf`**: drop the `peaks = { ... }` and `routes = { ... }` maps (~280 lines)
- **`src/`**: deleted (Python preserved in git history; Lambda zip now built from `apps/api/dist/`)

### Frontend (`apps/web/`)
- **No code changes in this PR.** The TS rewrite preserves the wire format. Cloudflare Pages source repointing to the new monorepo is a separate manual step (Cloudflare dashboard → Pages → Settings → Source).

## Order of apply (important)

Because we're moving rows from Terraform-managed `aws_dynamodb_table_item` to plain DDB rows, the order matters:

```bash
# 1. Build the new Lambda bundle locally
corepack pnpm -F api build

# 2. Seed the same data outside Terraform's view (idempotent PutItem)
AWS_PROFILE=sprawdzamszlak corepack pnpm -F api seed

# 3. Plan and review
cd infrastructure/terraform && terraform plan

# 4. Apply — Terraform will "destroy" the 36 aws_dynamodb_table_item entries,
#    but the rows themselves stay in DDB because step 2 wrote them again.
#    Lambda runtime + source code swap to TS happens in the same apply.
terraform apply
```

If you skip step 2, terraform apply would still succeed but DDB would be **empty** between the destroy and the next seed run.

## Security improvements baked in (security sweep 2026-05-01 issues)

- ✅ **H1** — 500 response carries opaque request id; raw error string stays in CloudWatch logs only
- ✅ **H3** — filename allowlist regex (`/^[a-z0-9_]{1,64}\.geojson$/`) enforced before presigned URL generation
- ✅ **H7** — Scan paginates with `Limit=200`; malformed rows skipped rather than failing the whole list

Issues #1 (H1), #3 (H3), #6 (H7) in this repo can be closed when this PR merges.

## Test plan

- [ ] `corepack pnpm -F api typecheck` — clean
- [ ] `corepack pnpm -F shared typecheck` — clean
- [ ] `corepack pnpm -F api build` — produces `apps/api/dist/handler.js`
- [ ] `corepack pnpm -F api seed` (against prod DDB) — writes 24 peaks + 12 routes
- [ ] `terraform plan` — matches expected diff (1 lambda update, 36 ddb_table_item destroys)
- [ ] After apply: `curl https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/` returns 24 peaks
- [ ] After apply: `curl https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/routes` returns 12 routes with presigned URLs
- [ ] Frontend (Cloudflare Pages) still loads the map (no wire format change expected)

## Next: W3

Admin panel skeleton + GPX upload endpoint. ADR-002 (auth) and ADR-004 (GPX parser) land before implementation.
