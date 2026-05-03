#!/usr/bin/env bash
# W2 bootstrap — TS rewrite of the Lambda handler + Terraform-managed data
# anti-pattern removal. Idempotent. Stops BEFORE `terraform apply`.
#
# Run from monorepo root:
#   bash scripts/w2-bootstrap.sh
#
# Prerequisite: W1 PR (#8) must be merged into main on GitHub. Locally, the
# main branch should contain apps/, packages/, infrastructure/terraform/.
#
# What it does:
#   1. Sanity checks (toolchain, W1 merged, repo clean)
#   2. Branches off main as chore/w2-ts-rewrite
#   3. Copies W2 templates over current files (handler.ts, schemas, seeds,
#      seed loader, lambda.tf, dynamodb.tf, locals.tf)
#   4. Removes obsolete Python source and seed-as-Terraform-resources
#   5. pnpm install + typecheck + build (exit criteria)
#   6. terraform fmt + validate + plan (no apply!)
#   7. Commits, pushes, opens PR, posts plan as PR comment
#
# What it explicitly does NOT do:
#   - terraform apply  (owner runs after reviewing the plan)
#   - pnpm -F api seed (owner runs BEFORE terraform apply, see PR body)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATES="$ROOT/scripts/w2-templates"
GH_OWNER="tlyko"
REPO="sprawdzamszlak"
BRANCH="chore/w2-ts-rewrite"

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
gh auth status >/dev/null 2>&1 || { red "gh not authenticated — run: gh auth login"; exit 1; }
PNPM="corepack pnpm"
$PNPM --version >/dev/null

# Verify W1 merged (apps/api/src/lambda_function.py exists from W1 filter-repo)
[ -d "$ROOT/apps/api"             ] || { red "W1 not merged: apps/api missing"; exit 1; }
[ -d "$ROOT/apps/web"             ] || { red "W1 not merged: apps/web missing"; exit 1; }
[ -d "$ROOT/packages/shared"      ] || { red "W1 not merged: packages/shared missing"; exit 1; }
[ -d "$ROOT/infrastructure/terraform" ] || { red "W1 not merged: infrastructure/terraform missing"; exit 1; }

green "W1 layout verified."

# ---------------------------------------------------------------------------
step "1. Branch off main"
# ---------------------------------------------------------------------------

if ! git diff --quiet || ! git diff --cached --quiet; then
  red "Working tree is dirty. Commit or stash before running."
  exit 1
fi

CURRENT="$(git branch --show-current)"
if [ "$CURRENT" = "$BRANCH" ]; then
  yellow "  Already on $BRANCH"
elif git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout "$BRANCH"
  yellow "  Switched to existing $BRANCH"
else
  git fetch origin main --quiet
  git checkout -b "$BRANCH" origin/main
  green "  Created $BRANCH off origin/main"
fi

# ---------------------------------------------------------------------------
step "2. Copy W2 templates"
# ---------------------------------------------------------------------------

copy() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$ROOT/$dst")"
  cp "$TEMPLATES/$src" "$ROOT/$dst"
  green "  $dst"
}

# apps/api
copy apps-api-handler.ts       apps/api/src/handler.ts
copy apps-api-package.json     apps/api/package.json
copy apps-api-build.ts         apps/api/build.ts
copy apps-api-scripts-seed.ts  apps/api/scripts/seed.ts
copy seeds-peaks.json          apps/api/seeds/peaks.json
copy seeds-routes.json         apps/api/seeds/routes.json

# packages/shared
copy packages-shared-index.ts  packages/shared/src/index.ts

# infrastructure/terraform
copy infra-tf-lambda.tf        infrastructure/terraform/lambda.tf
copy infra-tf-dynamodb.tf      infrastructure/terraform/dynamodb.tf
copy infra-tf-locals.tf        infrastructure/terraform/locals.tf

# ---------------------------------------------------------------------------
step "3. Remove obsolete Python source and infra src/"
# ---------------------------------------------------------------------------

if [ -f "$ROOT/apps/api/src/lambda_function.py" ]; then
  git rm "$ROOT/apps/api/src/lambda_function.py" >/dev/null
  green "  Removed apps/api/src/lambda_function.py (preserved in git history)"
fi

if [ -d "$ROOT/infrastructure/terraform/src" ]; then
  git rm -r "$ROOT/infrastructure/terraform/src" >/dev/null
  green "  Removed infrastructure/terraform/src/ (Lambda zip now built from apps/api/dist/)"
fi

# Stash any leftover lambda.zip
if [ -f "$ROOT/infrastructure/terraform/dist/lambda.zip" ]; then
  rm -f "$ROOT/infrastructure/terraform/dist/lambda.zip"
  green "  Removed stale infrastructure/terraform/dist/lambda.zip"
fi

# ---------------------------------------------------------------------------
step "4. pnpm install + typecheck + build (exit criteria)"
# ---------------------------------------------------------------------------

$PNPM install
$PNPM -F shared typecheck
$PNPM -F api typecheck
$PNPM -F api build

if [ ! -f "$ROOT/apps/api/dist/handler.js" ]; then
  red "apps/api/dist/handler.js missing after build — abort"
  exit 1
fi
green "  apps/api/dist/handler.js built ($(stat -f%z "$ROOT/apps/api/dist/handler.js" 2>/dev/null || stat -c%s "$ROOT/apps/api/dist/handler.js") bytes)"

# ---------------------------------------------------------------------------
step "5. terraform fmt + validate"
# ---------------------------------------------------------------------------

cd "$ROOT/infrastructure/terraform"

if [ ! -d ".terraform" ]; then
  yellow "  .terraform missing — running terraform init"
  terraform init -input=false 2>&1 | tail -5
fi

terraform fmt -recursive >/dev/null
terraform validate

# ---------------------------------------------------------------------------
step "6. terraform plan (NOT apply — owner approves)"
# ---------------------------------------------------------------------------

PLAN_FILE="/tmp/tf-plan-w2.txt"
yellow "  Running plan; output captured to $PLAN_FILE"
if ! terraform plan -no-color > "$PLAN_FILE" 2>&1; then
  red "terraform plan failed. See $PLAN_FILE."
  tail -40 "$PLAN_FILE"
  exit 1
fi
tail -8 "$PLAN_FILE"

cd "$ROOT"

# ---------------------------------------------------------------------------
step "7. Commit + push + open PR + post plan as comment"
# ---------------------------------------------------------------------------

git add -A
if git diff --cached --quiet; then
  yellow "  Nothing to commit — assuming this is a re-run on a finished branch"
else
  git commit -m "$(cat <<'EOF'
chore(w2): TS rewrite of Lambda handler + remove DDB-as-Terraform-resources

Lambda runtime: python3.13 → nodejs22.x. Handler rewritten in TypeScript with
parity vs the Python version. AWS SDK v3 (@aws-sdk/*) externalized; bundled
size stays small. Security sweep issues H1, H3, H7 baked in at rewrite time.

Data migration:
- aws_dynamodb_table_item.peaks and .routes removed from Terraform
- Data lives in apps/api/seeds/*.json
- One-shot loader at apps/api/scripts/seed.ts (BatchWriteItem)
- apps/api/src/lambda_function.py and infrastructure/terraform/src/ removed
  (history preserved by git filter-repo from W1)

Apply order owner runs:
  1. corepack pnpm -F api build
  2. corepack pnpm -F api seed     ← rows in DDB before TF removes its tracking
  3. terraform plan
  4. terraform apply
EOF
)"
  green "  Committed."
fi

git push -u origin "$BRANCH" 2>&1 | tail -3

if gh pr view "$BRANCH" --repo "$GH_OWNER/$REPO" >/dev/null 2>&1; then
  yellow "  W2 PR already open — skipping create"
  PR_NUM=$(gh pr view "$BRANCH" --repo "$GH_OWNER/$REPO" --json number -q .number)
else
  gh pr create --repo "$GH_OWNER/$REPO" \
    --base main --head "$BRANCH" \
    --title "chore(w2): TS rewrite of Lambda handler + DDB seed migration" \
    --body "$(cat "$TEMPLATES/w2-pr-body.md")"
  PR_NUM=$(gh pr view "$BRANCH" --repo "$GH_OWNER/$REPO" --json number -q .number)
  green "  Opened W2 PR #$PR_NUM"
fi

# Plan as comment
{
  echo "## \`terraform plan\` (W2)"
  echo ""
  echo "Captured by \`scripts/w2-bootstrap.sh\` on $(date '+%Y-%m-%d %H:%M %Z')."
  echo ""
  echo "<details><summary>Full plan output</summary>"
  echo ""
  echo '```hcl'
  cat "$PLAN_FILE"
  echo '```'
  echo ""
  echo "</details>"
} > /tmp/tf-plan-w2-comment.md

gh pr comment "$PR_NUM" --repo "$GH_OWNER/$REPO" --body-file /tmp/tf-plan-w2-comment.md >/dev/null
green "  Plan posted as comment."

# ---------------------------------------------------------------------------
green ""
green "==========================================================="
green "W2 PR #$PR_NUM ready for review."
green "==========================================================="
green ""
green "Before merging — apply order ON YOUR BOX:"
green "  1) cd $ROOT && corepack pnpm -F api build"
green "  2)            corepack pnpm -F api seed     # writes 24 peaks + 12 routes to DDB"
green "  3) cd infrastructure/terraform && terraform plan"
green "  4)                                terraform apply   # swaps Lambda runtime + removes TF table_item tracking"
green ""
green "Merge the PR after apply succeeds and the production endpoint returns 200 from the new TS handler."
