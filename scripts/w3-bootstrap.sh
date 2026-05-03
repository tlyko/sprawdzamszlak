#!/usr/bin/env bash
# W3 bootstrap — admin panel + GPX upload endpoint. Idempotent.
#
# Run from monorepo root:
#   bash scripts/w3-bootstrap.sh
#
# Prerequisite: W2 PR (#10) must be merged AND applied (terraform apply
# already swapped the Lambda to nodejs22.x with the TS handler from W2).
# Without W2 in production, the new admin route in this PR has nothing
# to land on.
#
# What it does:
#   1. Branch off main as chore/w3-admin-upload
#   2. Copy W3 templates: handler.ts (extended), lib/auth, lib/multipart,
#      lib/gpx, routes/admin-upload, packages/shared schemas, apps/web/admin
#      pages, infrastructure/terraform/lambda.tf (POST route + ADMIN_PASS
#      env), variables.tf
#   3. pnpm install (new deps: @tmcw/togeojson, @xmldom/xmldom)
#   4. pnpm typecheck + build (apps/api, packages/shared, apps/web)
#   5. terraform fmt + validate + plan (NOT apply)
#   6. Commit, push, open PR, post plan as PR comment
#
# What it does NOT do:
#   - terraform apply  (owner runs after generating ADMIN_PASS)
#   - Set the production ADMIN_PASS env var (owner generates with
#     `openssl rand -base64 32` and exports as TF_VAR_admin_pass)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATES="$ROOT/scripts/w3-templates"
GH_OWNER="tlyko"
REPO="sprawdzamszlak"
BRANCH="chore/w3-admin-upload"

cd "$ROOT"

green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*" >&2; }
step()   { printf "\n\033[1;36m==> %s\033[0m\n" "$*"; }

# ---------------------------------------------------------------------------
step "0. Sanity checks"
# ---------------------------------------------------------------------------

[ -f "$ROOT/CLAUDE.md" ] || { red "Run from monorepo root, not $PWD"; exit 1; }
git rev-parse --git-dir >/dev/null
command -v gh >/dev/null      || { red "gh CLI missing"; exit 1; }
command -v corepack >/dev/null || { red "corepack missing"; exit 1; }
gh auth status >/dev/null 2>&1 || { red "gh not authenticated"; exit 1; }
PNPM="corepack pnpm"
$PNPM --version >/dev/null

# Verify W2 has landed: lambda.tf must already point at nodejs22.x
LAMBDA_TF="$ROOT/infrastructure/terraform/lambda.tf"
if [ ! -f "$LAMBDA_TF" ] || ! grep -q "nodejs22.x" "$LAMBDA_TF"; then
  red "W2 not merged yet (lambda.tf doesn't have runtime nodejs22.x). Merge PR #10 first."
  exit 1
fi
green "W2 layout verified."

# ---------------------------------------------------------------------------
step "1. Branch off main"
# ---------------------------------------------------------------------------

if ! git diff --quiet || ! git diff --cached --quiet; then
  red "Working tree dirty. Commit or stash first."
  exit 1
fi

CURRENT="$(git branch --show-current)"
if [ "$CURRENT" = "$BRANCH" ]; then
  yellow "  Already on $BRANCH"
elif git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout "$BRANCH"
else
  git fetch origin main --quiet
  git checkout -b "$BRANCH" origin/main
  green "  Created $BRANCH off origin/main"
fi

# ---------------------------------------------------------------------------
step "2. Copy W3 templates"
# ---------------------------------------------------------------------------

copy() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$ROOT/$dst")"
  cp "$TEMPLATES/$src" "$ROOT/$dst"
  green "  $dst"
}

# packages/shared
copy packages-shared-index.ts            packages/shared/src/index.ts

# apps/api
copy apps-api-package.json               apps/api/package.json
copy apps-api-src-handler.ts             apps/api/src/handler.ts
copy apps-api-src-lib-auth.ts            apps/api/src/lib/auth.ts
copy apps-api-src-lib-multipart.ts       apps/api/src/lib/multipart.ts
copy apps-api-src-lib-gpx.ts             apps/api/src/lib/gpx.ts
copy apps-api-src-routes-admin-upload.ts apps/api/src/routes/admin-upload.ts

# apps/web admin pages
copy apps-web-app-admin-page.tsx        apps/web/app/admin/page.tsx
copy apps-web-app-admin-upload-page.tsx apps/web/app/admin/upload/page.tsx

# infrastructure/terraform
copy infra-tf-lambda.tf     infrastructure/terraform/lambda.tf
copy infra-tf-variables.tf  infrastructure/terraform/variables.tf

# ---------------------------------------------------------------------------
step "3. pnpm install + typecheck + build"
# ---------------------------------------------------------------------------

$PNPM install
$PNPM -F @sprawdzamszlak/shared typecheck
$PNPM -F @sprawdzamszlak/api typecheck
$PNPM -F @sprawdzamszlak/api build
$PNPM -F sprawdzamszlak-frontend build

if [ ! -f "$ROOT/apps/api/dist/handler.js" ]; then
  red "apps/api/dist/handler.js missing — abort"
  exit 1
fi
green "  api dist size: $(stat -f%z "$ROOT/apps/api/dist/handler.js" 2>/dev/null || stat -c%s "$ROOT/apps/api/dist/handler.js") bytes"

# ---------------------------------------------------------------------------
step "4. terraform fmt + validate"
# ---------------------------------------------------------------------------
# Plan + apply are now done by GitHub Actions on PR / merge (ADR-005).
# We only sanity-check the .tf files locally before push.

cd "$ROOT/infrastructure/terraform"

if [ ! -d ".terraform" ]; then
  yellow "  Running terraform init"
  terraform init -input=false 2>&1 | tail -5
fi

terraform fmt -recursive >/dev/null
terraform validate

cd "$ROOT"

# ---------------------------------------------------------------------------
step "5. Commit + push + open PR + post plan"
# ---------------------------------------------------------------------------

git add apps packages infrastructure/terraform
if git diff --cached --quiet; then
  yellow "  Nothing to commit"
else
  git commit -F "$TEMPLATES/w3-commit-message.txt"
  green "  Committed"
fi

git push -u origin "$BRANCH" 2>&1 | tail -3

if gh pr view "$BRANCH" --repo "$GH_OWNER/$REPO" >/dev/null 2>&1; then
  yellow "  PR already open"
  PR_NUM=$(gh pr view "$BRANCH" --repo "$GH_OWNER/$REPO" --json number -q .number)
else
  gh pr create --repo "$GH_OWNER/$REPO" \
    --base main --head "$BRANCH" \
    --title "chore(w3): admin panel + GPX upload endpoint" \
    --body-file "$TEMPLATES/w3-pr-body.md"
  PR_NUM=$(gh pr view "$BRANCH" --repo "$GH_OWNER/$REPO" --json number -q .number)
  green "  Opened W3 PR #$PR_NUM"
fi

green "  GitHub Actions will run terraform plan and post the output as a PR comment."

green ""
green "==========================================================="
green "W3 PR #$PR_NUM ready for review."
green "==========================================================="
green ""
green "Next steps (now that CI/CD is on GitHub Actions per ADR-005):"
green "  1) Generate admin password and save to 1Password:"
green "       openssl rand -base64 32"
green "  2) Add as GitHub repo secret named TF_VAR_ADMIN_PASS:"
green "       gh secret set TF_VAR_ADMIN_PASS --repo $GH_OWNER/$REPO"
green "  3) Review the W3 PR; the GHA-posted plan will show ADMIN_PASS=(known after apply)."
green "  4) Merge the PR — GitHub Actions runs terraform apply automatically."
green "  5) After merge, smoke test:"
green ""
green "Test after apply:"
green "  curl -X POST -u tomek:\$TF_VAR_admin_pass \\"
green "    -F id=test_route \\"
green "    -F name='Test' \\"
green "    -F type=off-piste \\"
green "    -F gpx=@some-file.gpx \\"
green "    https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/admin/upload"
