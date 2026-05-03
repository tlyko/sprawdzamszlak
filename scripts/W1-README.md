# W1 bootstrap — instrukcja po powrocie

## Co tu jest

Wszystkie pliki potrzebne do W1 (monorepo extract + pnpm bootstrap + GitHub setup) są gotowe. Jeden master script wykonuje całą robotę.

## Co Ty robisz po powrocie

```bash
cd /Users/tomek/repos/sprawdzamszlak
bash scripts/w1-bootstrap.sh
```

Pierwsze odpalenie zajmuje ~2-5 minut. Skrypt jest idempotentny — jeśli coś padnie w połowie, można puścić ponownie i pominie już-zrobione kroki.

## Co skrypt robi (8 kroków)

| # | Krok | Idempotentny? |
|---|------|---|
| 0 | Sanity checks (toolchain: `git-filter-repo`, `gh`, `corepack`) | ✓ |
| 1 | Backup obu repo jako bare mirrors do `/tmp/monorepo-backup/` | ✓ |
| 2 | `git filter-repo --to-subdirectory-filter apps/web` na clone frontend | ✓ |
| 3 | Split infrastructure: `src/` → `apps/api/src/`, reszta → `infrastructure/terraform/` | ✓ |
| 4 | Branch `chore/w1-monorepo-bootstrap` + merge 3 historii (`--allow-unrelated-histories`) | ✓ |
| 5 | Skopiowanie 16 templates (configs, stub handler, build.ts) + commit | ✓ |
| 6 | `pnpm install` + `pnpm -F api build` (exit criteria) | nie blocking |
| 7 | `gh repo create tlyko/sprawdzamszlak --private` + push, transfer issues, archive starych repo | ✓ |
| 8 | `gh pr create` dla brancha `chore/w1-monorepo-bootstrap` | ✓ |

## Co tracisz / co dostajesz

**Tracisz:**
- `tlyko/sprawdzamszlak-frontend` → archived (read-only)
- `tlyko/sprawdzamszlak-infrastructure` → archived (read-only)
- Issues #6-#11 (infra) + #4 (frontend) → przeniesione do nowego repo

**Dostajesz:**
- `tlyko/sprawdzamszlak` (private) z całą historią obu repo
- Strukturą:
  ```
  sprawdzamszlak/
  ├── apps/
  │   ├── api/   (102 LOC Pythona, do TS rewrite w W2)
  │   └── web/   (Next.js 16.2.4, leaflet, TatraMap)
  ├── packages/
  │   └── shared/  (pusty, do zod schemas w W2)
  ├── infrastructure/
  │   └── terraform/  (lambda.tf, dynamodb.tf, locals.tf, ...)
  ├── docs/adr/ADR-001-stack-and-monorepo.md
  ├── BACKLOG.md
  ├── CLAUDE.md
  ├── package.json, pnpm-workspace.yaml, tsconfig.base.json
  └── scripts/w1-bootstrap.sh + scripts/w1-templates/
  ```
- PR `chore/w1-monorepo-bootstrap` do review

## Co NIE działa się w W1

- Lambda runtime nie zmieniony — produkcja dalej Python 3.13
- `terraform apply` nie uruchomiony — żadnych zmian w produkcyjnej infrze
- Cloudflare Pages dalej deployuje z `sprawdzamszlak-frontend` repo (do W2)

## Jeśli coś się rozjedzie

```bash
# Hard reset do stanu sprzed W1:
git -C /Users/tomek/repos/sprawdzamszlak reset --hard 166891a
git -C /Users/tomek/repos/sprawdzamszlak clean -fdx -e sprawdzamszlak-frontend -e sprawdzamszlak-infrastructure
# (wyklucza side-by-side directories ze starych repo, te są niezależne)

# Re-run script
bash scripts/w1-bootstrap.sh
```

Bare mirrors w `/tmp/monorepo-backup/` zostają — możesz przywrócić oba repo lokalnie z nich gdyby filter-repo coś zepsuł:

```bash
git clone /tmp/monorepo-backup/frontend.git ~/Desktop/frontend-recovered
```

## Jeśli padnie krok 7 (gh)

Najczęstsze:
- **`Bad credentials`** — token wygasł, `gh auth login`
- **`Repository already exists`** — skrypt to wykryje i pominie create

## Dalej (W2)

Po merge tego PR-a startujemy W2:
- TS rewrite Lambdy (`apps/api/src/handler.ts` zastępuje `lambda_function.py`)
- Strava typings + zod schemas w `packages/shared`
- `infrastructure/terraform/lambda.tf` runtime → `nodejs22.x`, source_dir → `apps/api/dist/`
- `terraform plan` + apply (Lambda function name nie zmienia się — bezpieczna podmiana zip)
- Cloudflare Pages source → nowe repo
