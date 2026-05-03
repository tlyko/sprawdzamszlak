#!/usr/bin/env bash
# W1 monorepo bootstrap — autonomous, idempotent.
#
# Run from repo root:
#   bash scripts/w1-bootstrap.sh
#
# What it does:
#   1. Backups both source repos as bare mirrors (recovery point)
#   2. Filter-repos frontend into apps/web/ (preserves history)
#   3. Filter-repos infrastructure into apps/api/src/ + infrastructure/terraform/ split
#   4. Merges all three filtered histories into THIS repo (--allow-unrelated-histories)
#   5. Drops the now-redundant sprawdzamszlak-frontend/ and sprawdzamszlak-infrastructure/ subdirs
#   6. Copies pnpm/tsconfig/build/handler templates into place
#   7. Runs pnpm install + pnpm -F api build for exit-criteria sanity
#   8. Creates tlyko/sprawdzamszlak (private) on GitHub, pushes, transfers issues, archives old repos
#
# Idempotency:
#   - If a step has already happened, the script skips it.
#   - To start over from a known state:
#       git reset --hard 166891a && git clean -fdx
#     Then re-run this script.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATES="$ROOT/scripts/w1-templates"
TMP="/tmp/monorepo-extract"
BACKUP="/tmp/monorepo-backup"
GH_OWNER="tlyko"
NEW_REPO="sprawdzamszlak"
FRONTEND_REPO="sprawdzamszlak-frontend"
INFRA_REPO="sprawdzamszlak-infrastructure"

cd "$ROOT"

green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*" >&2; }
step()   { printf "\n\033[1;36m==> %s\033[0m\n" "$*"; }

# ---------------------------------------------------------------------------
step "0. Sanity checks"
# ---------------------------------------------------------------------------

[ -f "$ROOT/CLAUDE.md" ] || { red "Run from monorepo root, not $PWD"; exit 1; }
git -C "$ROOT" rev-parse --git-dir >/dev/null || { red "Not a git repo"; exit 1; }

command -v git-filter-repo >/dev/null || { red "git-filter-repo missing — brew install git-filter-repo"; exit 1; }
command -v gh >/dev/null               || { red "gh CLI missing"; exit 1; }
command -v corepack >/dev/null         || { red "corepack missing — comes with Node 16.10+"; exit 1; }

gh auth status >/dev/null 2>&1 || { red "gh not authenticated — run: gh auth login"; exit 1; }

# Make sure pnpm is available via corepack (no global install needed)
PNPM="corepack pnpm"
$PNPM --version >/dev/null || { red "corepack pnpm failed"; exit 1; }
green "Toolchain OK ($(git-filter-repo --version 2>&1 | head -1) + $(gh --version | head -1) + pnpm $($PNPM --version))"

# ---------------------------------------------------------------------------
step "1. Backup both source repos as bare mirrors"
# ---------------------------------------------------------------------------

mkdir -p "$BACKUP"
for repo in "$FRONTEND_REPO" "$INFRA_REPO"; do
  if [ -d "$BACKUP/$repo.git" ]; then
    yellow "  $repo.git already backed up — skipping"
  else
    git clone --mirror "$ROOT/$repo" "$BACKUP/$repo.git"
    green "  Backed up $repo → $BACKUP/$repo.git"
  fi
done

# ---------------------------------------------------------------------------
step "2. Filter-repo frontend → apps/web/"
# ---------------------------------------------------------------------------

rm -rf "$TMP/frontend-filtered"
mkdir -p "$TMP"
git clone --no-local "$ROOT/$FRONTEND_REPO" "$TMP/frontend-filtered"
( cd "$TMP/frontend-filtered" && git filter-repo --to-subdirectory-filter apps/web )
green "  $(git -C "$TMP/frontend-filtered" log --oneline | wc -l | tr -d ' ') commits rewritten under apps/web/"

# ---------------------------------------------------------------------------
step "3. Filter-repo infrastructure → apps/api/src/ + infrastructure/terraform/"
# ---------------------------------------------------------------------------

rm -rf "$TMP/infra-api-filtered" "$TMP/infra-tf-filtered"

# Pass 1: keep only src/, rename src/ → apps/api/src/
git clone --no-local "$ROOT/$INFRA_REPO" "$TMP/infra-api-filtered"
( cd "$TMP/infra-api-filtered" && git filter-repo --path src/ --path-rename src/:apps/api/src/ )
green "  api: $(git -C "$TMP/infra-api-filtered" log --oneline | wc -l | tr -d ' ') commits under apps/api/src/"

# Pass 2: drop src/, move root → infrastructure/terraform/
git clone --no-local "$ROOT/$INFRA_REPO" "$TMP/infra-tf-filtered"
( cd "$TMP/infra-tf-filtered" && \
    git filter-repo --invert-paths --path src/ && \
    git filter-repo --to-subdirectory-filter infrastructure/terraform )
green "  tf:  $(git -C "$TMP/infra-tf-filtered" log --oneline | wc -l | tr -d ' ') commits under infrastructure/terraform/"

# ---------------------------------------------------------------------------
step "4. Merge filtered histories into monorepo (chore/w1-monorepo-bootstrap branch)"
# ---------------------------------------------------------------------------

# Make sure we are on a clean working tree
if ! git diff --quiet || ! git diff --cached --quiet; then
  red "Working tree is dirty. Commit or stash before running."
  exit 1
fi

# Create or switch to the W1 branch from current main
if git show-ref --verify --quiet refs/heads/chore/w1-monorepo-bootstrap; then
  yellow "  Branch chore/w1-monorepo-bootstrap exists — switching"
  git checkout chore/w1-monorepo-bootstrap
else
  git checkout -b chore/w1-monorepo-bootstrap
fi

# Add filtered repos as remotes (idempotent)
for name in frontend-filtered infra-api-filtered infra-tf-filtered; do
  if git remote | grep -q "^${name}$"; then
    git remote remove "$name"
  fi
  git remote add "$name" "$TMP/$name"
done

git fetch frontend-filtered    --quiet
git fetch infra-api-filtered   --quiet
git fetch infra-tf-filtered    --quiet

# Merge each filtered history (skip if already merged — detect by grep'ing the merge commit)
merge_one() {
  local remote="$1" label="$2"
  local head="$remote/main"
  if ! git rev-parse --verify "$head" >/dev/null 2>&1; then
    head="$remote/master"
  fi
  if git log --pretty=format:'%s' | grep -q "Merge filtered history: $label"; then
    yellow "  $label already merged — skipping"
    return
  fi
  git merge --allow-unrelated-histories --no-ff "$head" \
    -m "Merge filtered history: $label" || {
      red "Merge of $label failed. Resolve conflicts, commit, then re-run script."
      exit 1
    }
  green "  Merged $label"
}

merge_one frontend-filtered  "frontend → apps/web"
merge_one infra-api-filtered "infrastructure src/ → apps/api/src"
merge_one infra-tf-filtered  "infrastructure root → infrastructure/terraform"

# Clean up the side-by-side legacy directories that are now redundant
# (they are NOT tracked by this repo's git, only by their own .git subdirs)
for legacy in "$ROOT/$FRONTEND_REPO" "$ROOT/$INFRA_REPO"; do
  if [ -d "$legacy/.git" ]; then
    yellow "  Legacy directory $legacy is still on disk."
    yellow "  Leaving it for you to remove manually after verifying merge worked:"
    yellow "    rm -rf '$legacy'"
  fi
done

# Drop the temporary remotes
for name in frontend-filtered infra-api-filtered infra-tf-filtered; do
  git remote remove "$name" 2>/dev/null || true
done

# ---------------------------------------------------------------------------
step "5. Drop temporary remotes and copy templates"
# ---------------------------------------------------------------------------

# Copy all template files. Each is committed below as a separate commit so the
# monorepo bootstrap diff is reviewable file-by-file in the W1 PR.
copy_template() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$ROOT/$dst")"
  cp "$TEMPLATES/$src" "$ROOT/$dst"
  green "  $dst"
}

copy_template root-package.json            package.json
copy_template root-pnpm-workspace.yaml     pnpm-workspace.yaml
copy_template root-tsconfig.base.json      tsconfig.base.json
copy_template root-nvmrc                   .nvmrc
copy_template root-editorconfig            .editorconfig
copy_template root-gitignore               .gitignore
copy_template root-env.example             .env.example
copy_template root-prettierrc.json          .prettierrc.json
copy_template root-npmrc                    .npmrc
copy_template apps-api-package.json         apps/api/package.json
copy_template apps-api-tsconfig.json        apps/api/tsconfig.json
copy_template apps-api-build.ts             apps/api/build.ts
copy_template apps-api-handler.ts           apps/api/src/handler.ts
copy_template apps-web-tsconfig.json        apps/web/tsconfig.json
copy_template packages-shared-package.json  packages/shared/package.json
copy_template packages-shared-tsconfig.json packages/shared/tsconfig.json
copy_template packages-shared-index.ts      packages/shared/src/index.ts

# Stage and commit the bootstrap files
git add \
  package.json pnpm-workspace.yaml tsconfig.base.json .nvmrc .editorconfig \
  .gitignore .env.example .prettierrc.json .npmrc \
  apps/api/package.json apps/api/tsconfig.json apps/api/build.ts apps/api/src/handler.ts \
  apps/web/tsconfig.json \
  packages/shared/package.json packages/shared/tsconfig.json packages/shared/src/index.ts

git commit -m "chore: bootstrap pnpm workspaces + tsconfig + apps/api stub

- Root package.json with packageManager pin (pnpm via corepack)
- pnpm-workspace.yaml with apps/* and packages/*
- tsconfig.base.json with strict mode shared by apps and packages
- .nvmrc, .editorconfig, .prettierrc.json
- apps/api: package.json + tsconfig + esbuild build.ts + stub handler
- apps/web: tsconfig.json now extends the base
- packages/shared: empty package with zod export point
- .env.example with STRAVA_* and ADMIN_* placeholders
- .gitignore extended with monorepo-wide ignores

W1 of ADR-001. Lambda still runs Python in production; no IaC changes.
" || yellow "  Nothing to commit (already done in a prior run)"

# ---------------------------------------------------------------------------
step "6. pnpm install + apps/api build (exit criteria)"
# ---------------------------------------------------------------------------

$PNPM install
$PNPM -F api build

if [ -f "$ROOT/apps/api/dist/handler.js" ]; then
  green "  apps/api/dist/handler.js built successfully"
else
  red "apps/api/dist/handler.js missing after build — investigate"
  exit 1
fi

# ---------------------------------------------------------------------------
step "7. GitHub: create monorepo, push, transfer issues, archive old repos"
# ---------------------------------------------------------------------------

# Create new repo if it doesn't exist
if gh repo view "$GH_OWNER/$NEW_REPO" >/dev/null 2>&1; then
  yellow "  $GH_OWNER/$NEW_REPO already exists — skipping create"
else
  gh repo create "$GH_OWNER/$NEW_REPO" --private \
    --description "Hiking activities visualization (Tatra). Monorepo." \
    --confirm
  green "  Created $GH_OWNER/$NEW_REPO (private)"
fi

# Add origin if not there
if ! git remote | grep -q '^origin$'; then
  git remote add origin "git@github.com:$GH_OWNER/$NEW_REPO.git"
fi

# Push main first (so PR can be opened against it), then the W1 branch
git push -u origin main 2>&1 | tail -3 || yellow "  main already pushed"
git push -u origin chore/w1-monorepo-bootstrap

# Transfer issues from old repos to new
ISSUES_INFRA=(6 7 8 9 10 11)
for n in "${ISSUES_INFRA[@]}"; do
  if gh issue view "$n" --repo "$GH_OWNER/$INFRA_REPO" --json state -q .state 2>/dev/null \
       | grep -qi 'open\|closed'; then
    gh issue transfer "$n" --repo "$GH_OWNER/$INFRA_REPO" "$GH_OWNER/$NEW_REPO" \
      || yellow "  issue #$n transfer skipped (may have been transferred already)"
  fi
done
gh issue transfer 4 --repo "$GH_OWNER/$FRONTEND_REPO" "$GH_OWNER/$NEW_REPO" \
  || yellow "  frontend issue #4 transfer skipped"

# Archive old repos (read-only after this point)
for old in "$FRONTEND_REPO" "$INFRA_REPO"; do
  if gh repo view "$GH_OWNER/$old" --json isArchived -q .isArchived | grep -q true; then
    yellow "  $GH_OWNER/$old already archived"
  else
    gh repo archive "$GH_OWNER/$old" --yes
    green "  Archived $GH_OWNER/$old"
  fi
done

# ---------------------------------------------------------------------------
step "8. Open W1 PR"
# ---------------------------------------------------------------------------

if gh pr view chore/w1-monorepo-bootstrap --repo "$GH_OWNER/$NEW_REPO" >/dev/null 2>&1; then
  yellow "  W1 PR already open — skipping"
else
  gh pr create --repo "$GH_OWNER/$NEW_REPO" \
    --base main --head chore/w1-monorepo-bootstrap \
    --title "chore(w1): monorepo extract + pnpm bootstrap + apps/api stub" \
    --body "$(cat "$TEMPLATES/w1-pr-body.md")"
  green "  Opened W1 PR"
fi

green ""
green "============================================="
green "W1 bootstrap complete."
green "============================================="
green ""
green "Next steps:"
green "  1. Review the W1 PR on GitHub"
green "  2. Verify locally: corepack pnpm -F web dev   (Next.js dev server)"
green "  3. Verify locally: corepack pnpm -F api build (esbuild bundle)"
green "  4. Merge the PR when satisfied"
green "  5. Manually remove the legacy side-by-side dirs:"
green "       rm -rf '$ROOT/$FRONTEND_REPO' '$ROOT/$INFRA_REPO'"
green ""
green "W2 starts after merge: TS rewrite of the Lambda handler."
