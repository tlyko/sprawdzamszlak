## Summary

W1 of [ADR-001](docs/adr/ADR-001-stack-and-monorepo.md) — monorepo extract + bootstrap. **No production changes.**

- Frontend (`sprawdzamszlak-frontend`) → `apps/web/` with full git history (`git filter-repo --to-subdirectory-filter`)
- Infrastructure split:
  - `src/lambda_function.py` → `apps/api/src/lambda_function.py` (history kept)
  - everything else (`*.tf`, `README.md`, `.terraform.lock.hcl`) → `infrastructure/terraform/` (history kept)
- pnpm workspaces (`apps/*`, `packages/*`) with `packageManager` pinned via corepack — no global install required
- `tsconfig.base.json` shared across packages with strict mode
- `apps/api/build.ts` uses esbuild to produce a single ESM bundle for Lambda nodejs22.x (output: `apps/api/dist/handler.js`)
- `apps/api/src/handler.ts` is a W1 stub returning `{ message: 'hello from W1 stub — TS rewrite arrives in W2' }`
- `packages/shared` empty placeholder for zod schemas (filled in W2)
- `.env.example`, `.editorconfig`, `.prettierrc.json`, `.npmrc` (with `node-linker=hoisted` for Next 16 + leaflet compatibility), `.nvmrc` (22)

## What is NOT in this PR

- ❌ Lambda runtime change (still `python3.13` in `infrastructure/terraform/lambda.tf`) — happens in W2 with the TS rewrite
- ❌ `terraform apply` — production Lambda still runs the original Python handler
- ❌ Frontend hosting changes — Cloudflare Pages still deploys from the **old** `sprawdzamszlak-frontend` repo until W2 (when CF Pages source is repointed)

## Verification

- [x] `pnpm install` clean (no peer warnings, hoisted layout)
- [x] `pnpm -F api build` produces `apps/api/dist/handler.js`
- [ ] `pnpm -F web dev` starts on `:3000` (manual check)
- [ ] Production endpoint still returns 200 (no infra changes were made)

## Side effects on the GitHub side

- `tlyko/sprawdzamszlak-frontend` → archived (read-only) after PR merge
- `tlyko/sprawdzamszlak-infrastructure` → archived (read-only) after PR merge
- Issues #6-#11 (infra) and #4 (frontend) transferred to this repo

## Next: W2

TS rewrite of the Python Lambda handler. New zod schemas in `packages/shared`. Update `lambda.tf` runtime to `nodejs22.x`. Deploy via Terraform (state migration not needed — same function name, just zip contents change).
