---
description: Workflow migracji z dwóch osobnych repo do monorepo z apps/ + packages/ + infrastructure/
---

Migrujemy z dwóch osobnych repo do monorepo. To **nieodwracalna zmiana strukturalna**, więc idziemy ostrożnie.

## Pre-requirements (sprawdź zanim ruszysz)
- [ ] Audyt obu repo jest zrobiony (jeśli nie — STOP, najpierw `/audyt`)
- [ ] ADR 0001 o stacku zaakceptowany (jeśli nie — STOP, najpierw `@architect`)
- [ ] Oba istniejące repo mają commitnięte i pushnięte wszystkie zmiany (clean working tree)
- [ ] Właściciel ma backup tfstate i lockfile od bazy (jeśli stack dotyczy)

Zapytaj właściciela żeby potwierdził powyższe **explicit** zanim przejdziesz dalej.

## Krok 1: Plan migracji (dokumentacja)
Wywołaj `architect` żeby napisał `docs/migration-plan.md` z:
- Konkretnymi krokami
- Co zachowujemy z historii git (subtree merge zachowuje commity)
- Jak zmieniają się ścieżki Terraforma (referencje do nowego `apps/api/dist/`)
- Jak zmienia się build pipeline
- Plan rollback (co jeśli się wywali w połowie)

Pokaż plan właścicielowi. **Czekaj na akceptację.**

## Krok 2: Tworzenie szkieletu monorepo
W nowym katalogu (np. `~/repos/sprawdzamszlak/`):
```bash
git init
# CLAUDE.md, .claude/, README.md już są (z setupu)
mkdir -p apps packages infrastructure docs/adr
```

Stwórz:
- `package.json` (root) z workspaces
- `pnpm-workspace.yaml` (lub odpowiednik dla npm)
- `tsconfig.base.json`
- `.gitignore` (node_modules, .env*, .terraform/, *.tfstate*, dist/, .next/)

Pierwszy commit: `chore: initial monorepo skeleton`

## Krok 3: Migracja frontendu z historią
Z poziomu nowego monorepo:
```bash
git subtree add --prefix=apps/web /path/to/sprawdzamszlak-frontend main --squash=false
```
(`--squash=false` zachowuje pełną historię)

Adaptacja:
- Move/aktualizuj `package.json` (nazwa: `@sprawdzamszlak/web`)
- Aktualizuj `tsconfig.json` żeby extendował `tsconfig.base.json`
- Sprawdź czy build wciąż przechodzi: `pnpm --filter web build`

Commit: `chore: import frontend into apps/web`

## Krok 4: Migracja infrastructure z historią
```bash
git subtree add --prefix=infrastructure-tmp /path/to/sprawdzamszlak-infrastructure main --squash=false
```

Tymczasowo do `infrastructure-tmp`, bo będziemy rozdzielać Terraform od kodu Lambdy.

## Krok 5: Wydzielenie kodu Lambdy → apps/api
Tu wchodzi `aws-infra`. Kroki:
1. Utwórz `apps/api/` ze swoim `package.json`, `tsconfig.json`, `src/handlers/`
2. **Przenieś** kod handlerów z `infrastructure-tmp/lambdas/*/` (lub gdziekolwiek są) do `apps/api/src/handlers/`
3. Skonfiguruj esbuild build (per-handler bundling do `apps/api/dist/<handler>.zip`)
4. W `infrastructure-tmp/terraform/` zaktualizuj `data "archive_file"` żeby wskazywało na `../../apps/api/dist/`
5. Test: `pnpm --filter api build && cd infrastructure-tmp/terraform && terraform plan` — plan powinien być no-op poza zmianą source_code_hash

Commit: `refactor: extract lambda handlers from terraform to apps/api`

## Krok 6: Finalne ułożenie infrastructure
```bash
git mv infrastructure-tmp/terraform infrastructure/terraform
git mv infrastructure-tmp/scripts infrastructure/scripts  # jeśli są
rm -rf infrastructure-tmp
```

Commit: `chore: finalize infrastructure layout`

## Krok 7: Wspólne pakiety
Wywołaj `architect` żeby zaproponował co idzie do `packages/shared/`:
- Typy `Activity`, `Track`
- Zod schemas
- Wspólne stałe (enum typów aktywności)

Stwórz `packages/shared/`, przenieś te rzeczy, uaktualnij importy w `apps/web` i `apps/api`.

Commit: `feat: add packages/shared with common types`

## Krok 8: CI / scripts
- Dodaj `package.json` scripts na poziomie roota: `build`, `test`, `lint`, `typecheck` (wszystkie `pnpm -r`)
- (Opcjonalnie) GitHub Actions workflow

Commit: `chore: add root scripts and ci`

## Krok 9: Test end-to-end
- `pnpm install` od zera w czystym checkout
- `pnpm -r build` — wszystko buduje się
- `pnpm -r test` — przechodzi
- `cd infrastructure/terraform && terraform plan` — no-op

Jeśli OK → push do remote (nowe repo lub force-push do jednego ze starych z nową historią — decyzja właściciela)

## Krok 10: Archiwizacja starych repo
- Stare repo: oznaczyć jako "archived" (na GitHubie / GitLabie)
- README starych repo: dodać "→ migrated to https://github.com/.../sprawdzamszlak"
- **Nie usuwaj** od razu — zostaw na 30 dni jako safety net

## Pułapki, na które uważaj
- **Path-y w Terraformie** — wszystkie relatywne ścieżki będą się zmieniać
- **Workspace-relative imports** — TypeScript `paths` w `tsconfig.base.json`
- **CI environment vars** — jeśli były per-repo, teraz są wspólne
- **Lambda env vars** — sprawdź że nie odwołują się do nieistniejących ścieżek
- **GitHub Actions secrets** — jeśli były w starym repo, trzeba ustawić w nowym

## Status raportowanie
Po każdym kroku **pokaż diff** (lub krótkie summary co się zmieniło) zanim ruszysz dalej. Migracja musi być w pełni transparentna dla właściciela.
