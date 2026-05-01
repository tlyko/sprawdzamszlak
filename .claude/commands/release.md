---
description: Checklist przed deployem produkcyjnym
---

Lecimy z release na sprawdzamszlak.pl. Przejdź checklistę:

## 1. Stan kodu
- [ ] Branch `main` aktualny, brak niezmergowanych branchy
- [ ] `pnpm -r test` zielony
- [ ] `pnpm -r lint` / `pnpm -r typecheck` zielone
- [ ] `pnpm audit --production` — brak high/critical (lub świadoma decyzja)

## 2. Security sweep
Wywołaj `security` z zakresem: zmiany od ostatniego release. Jeśli są ⚠️/🚨 — STOP, naprawiamy.

## 3. Terraform
- [ ] `terraform plan` z poziomu `infrastructure/terraform/` pokazany
- [ ] Plan wygląda jak oczekiwany (żadnych nieoczekiwanych destroy/replace)
- [ ] Backup tfstate zrobiony (S3 versioning włączony? jeśli tak — OK, są snapshots)
- [ ] **`aws-infra` review** planu

## 4. Storage / DB
- [ ] DynamoDB: nowe atrybuty / GSI — sprawdzić że nie blokuje istniejących odczytów
- [ ] S3: nowe lifecycle / policy — review
- [ ] Backup strategy aktualny

## 5. Config
- [ ] `.env.example` aktualny
- [ ] Sekrety w Secrets Manager / SSM (nie w Lambda env vars, nie w `.tfvars`)
- [ ] CSP, CORS, cookies — pod produkcyjne domeny

## 6. Integracje
- [ ] Webhook URL Stravy — produkcyjny endpoint
- [ ] OAuth redirect URIs zaktualizowane w Strava app settings
- [ ] Rate limit headroom OK (`X-RateLimit-Usage` z ostatnich dni)

## 7. Frontend
- [ ] Bundle size — nie urosło >20% bez powodu
- [ ] Lighthouse > 90 perf, > 95 a11y na landingu
- [ ] Test na realnych device'ach: telefon, laptop

## 8. Lambda-specific
- [ ] Cold start: bundle size sensowny (<5MB unzipped per handler)
- [ ] Memory / timeout settings adequate
- [ ] CloudWatch log groups istnieją z retention

## 9. Rollback plan
- [ ] Wiemy jak cofnąć (git tag poprzedniej wersji)
- [ ] Wiemy jak cofnąć Lambdy (Lambda versions / aliases? lub redeploy poprzedniego zip?)
- [ ] Wiemy jak cofnąć Terraform (tfstate poprzedni w S3 versioning, lub git revert + apply)

## 10. Po deployu
- [ ] Smoke test: landing, OAuth flow, widok aktywności
- [ ] CloudWatch logs z pierwszych 30 min — wyłapanie błędów
- [ ] Sentry / monitoring uruchomiony

Pokaż checklistę, czekaj na potwierdzenie każdego punktu lub świadomy skip.
