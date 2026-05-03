# ADR-001: Stack and monorepo target

**Date:** 2026-05-02
**Status:** **Accepted** (2026-05-02)
**Decision-maker:** Tomek (właściciel) — zaakceptowane 2026-05-02
**Author:** architect (po pełnym audycie + security sweepie + push-backu właściciela na pierwszą rekomendację)

---

## Context

`sprawdzamszlak.pl` to single-user aplikacja do wizualizacji aktywności górskich (Tatry, pozaszlaki, taternictwo). Stan po audycie i security sweepie:

- **Frontend** (`sprawdzamszlak-frontend`): Next.js 16.2.4 + React 19 + Leaflet, hostowany na Cloudflare Pages (custom domain `sprawdzamszlak.pl`, canonical `sprawdzamszlak-frontend.pages.dev`). Jeden plik `TatraMap.tsx` (219 LOC), brak testów.
- **Backend** (`sprawdzamszlak-infrastructure`): pojedyncza Lambda **Python 3.13** (102 LOC, `lambda_function.py`), wyłącznie `boto3` (built-in), bez external deps. API Gateway HTTP v2, region `eu-west-1`, account `214598715232`.
- **Storage:** 2 tabele DynamoDB (`sprawdzamszlak-data` peaks, `sprawdzamszlak-routes` routes) z PK `id` (string), brak GSI, billing **PAY_PER_REQUEST**. Bucket S3 z 12 plikami GeoJSON. 24 peaki zaszyte w `locals.tf` jako `aws_dynamodb_table_item` (anti-pattern).
- **IaC:** Terraform Cloud (workspace `sprawdzamszlak-infrastructure`, org `sprawdzamszlak-org`), AWS provider 6.20.0.
- **Security:** wszystkie Critical findings zamknięte (PRy zmergowane, `terraform apply` przeszedł).
- **Niespójność:** CLAUDE.md zakłada Node.js dla Lambdy — w rzeczywistości Python. ADR-001 to dopasowuje (TS rewrite).

**Cel projektu (z CLAUDE.md):** monorepo `apps/` + `packages/` + `infrastructure/`, integracje Strava (priorytet) i Garmin, sensowna architektura **bez nadmiernej inżynierii**. **Single-user dziś**, otwarcie hipotetyczne.

**Skala:** ~30 peaks docelowo, ~100 routes (target), ~1-5 Strava webhooków/dzień szczytowo. GPX-y w MB-ach, nie GB-ach. **Realna cała baza danych: pojedyncze MB, nie GB.**

**Historia tego ADR:** pierwsza wersja rekomendowała **Option C** (Cloudflare Pages + Fly.io + Neon/Supabase Postgres + PostGIS + TS rewrite). Właściciel **odrzucił rekomendację**, zwracając uwagę że:

1. **DynamoDB free tier jest forever** w trybie PAY_PER_REQUEST: 25 GB storage, 25 RCU/WCU on-demand equivalents, **2.5 mln stream reads + 1 mln writes / mc forever** (nie 12 miesięcy jak EC2/RDS). Dla naszej skali = **€0/mc forever**.
2. PostGIS to inżynieria pod **hipotetyczną** przyszłość. Nie mamy use case'u dla `ST_Intersects` / `ST_DWithin` w v1. "Track-na-mapie" renderuje się jako GeoJSON w Leaflecie po stronie klienta — DDB tu wystarczy w pełni.
3. Migracja DB pod tight 6-tyg deadline = **niepotrzebne ryzyko regresji**.
4. Mniej providerów = mniej rzeczy do utrzymania (CLAUDE.md "mała powierzchnia").

Re-rekomendacja: **Option A modified** — zostajemy na AWS dla storage/compute, ale modernizujemy kod (monorepo, TS, scope: GPX upload + admin + Strava).

Ten ADR rozstrzyga trzy splecione decyzje:

1. **Gdzie hostujemy backend i storage** → AWS (DDB + Lambda + S3 + API GW), nie migrujemy.
2. **W jakim języku piszemy backend** → TypeScript (rewrite z Python, 102 LOC).
3. **Jak ekstrahujemy monorepo** → `git filter-repo` z zachowaniem historii.

---

## Decision drivers

Ranking po wadze (po push-backu właściciela 2026-05-02):

1. **Hard deadline 2026-06-15 (sezon taternicki).** Strava webhook MUSI działać end-to-end: aktywność → webhook → fetch GPX → S3 + DDB → mapa. 6 tygodni od dziś. Każda decyzja wagą tej daty.
2. **€0/mc forever — non-negotiable.** Właściciel explicitly preferuje pozostanie w free tier. DDB PAY_PER_REQUEST + Lambda free tier (1M req/mc forever) + S3 (5 GB free przez 12m, potem grosze) + API GW HTTP ($1/mln req po free tier) = **realnie €0/mc dla naszej skali**.
3. **YAGNI agresywnie (CLAUDE.md).** Nie przebudowujemy storage layer "bo PostGIS jest fajny". Przebudowujemy gdy mamy konkretny use case.
4. **Shared types frontend/backend.** Zod schemas dla Peak, Route, StravaActivity dzielone między `apps/web` i `apps/api`.
5. **Solo dev mindset (CLAUDE.md).** Wraca po 3 miesiącach, ma rozumieć kod. Jeden ekosystem (npm/TS) > dwa (Python + TS).
6. **Strava integration first.** Ekosystem TS bogatszy (`strava-v3`, webhook signature helpers). Stravalib Python działa, ale community cieńszy.
7. **Mała powierzchnia.** AWS już skonfigurowane, IAM ustawione, Terraform przetestowany. Dodanie Fly + Supabase = 2 nowych providerów + nowe secrets + nowe failure modes.
8. **Ryzyko regresji.** Już jest infra na produkcji po security sweepie. Każda migracja storage = okno na zepsucie działającego systemu w okresie pre-deadline.
9. **Cold starts.** Lambda Node.js z esbuild bundle ~50-150ms cold start (vs Python 500-800ms). Akceptowalne dla Strava webhook (timeout 2s — z marginesem).
10. **Optionality.** Decyzja cofalna: gdy realnie pojawi się spatial use case → ADR-006 + migracja DDB → Postgres jako osobny projekt po-sezonie. **Nie robimy tego teraz.**

---

## Hard constraints

1. **Deadline 2026-06-15** — Strava webhook → S3+DDB → mapa działa end-to-end. **6 tygodni kalendarzowych.** Po tej dacie sezon taternicki w którym apka musi działać.
2. **Effective €0/mc** — wybieramy stack mieszczący się w darmowych poziomach. DDB PAY_PER_REQUEST + Lambda free tier + S3 = €0 forever w naszej skali.
3. **Cloudflare DNS confirmed** — `dig +short NS sprawdzamszlak.pl` zwraca `leia.ns.cloudflare.com` i `roman.ns.cloudflare.com`. Frontend już na CF Pages, nie zmieniamy.
4. **AWS root MFA + Cost Anomaly Detection — operational gate.** Status nieznany — flagujemy jako pre-W3 gate (delegowane do `security`). **W Option A te wymagania zostają — AWS jest naszym gospodarzem long-term, nie tymczasowym.**
5. **Solo dev, ~15-20h/tydzień** (wieczory). Realny budżet 6 tygodni: **~90-120h roboczych**.
6. **CI/CD nie istnieje dziś** — flagujemy jako follow-up (ADR-005), nie blokuje deadline'u (deploy ręczny `terraform apply` + `wrangler deploy` wystarczy na sezon).

---

## Considered options

### Option A modified — Stay on AWS, modernize code only (RECOMMENDED)

**Storage / hosting (zostaje):**
- AWS Lambda + DynamoDB + S3 + API Gateway HTTP v2 (region `eu-west-1`).
- Cloudflare Pages dla frontu (`sprawdzamszlak.pl`).
- Terraform Cloud dla state (na razie; ADR-005 może to zmienić po-sezonie).
- DDB schema **multi-table** (`sprawdzamszlak-data` peaks, `sprawdzamszlak-routes` routes) — bez single-table redesign teraz. Dorzucamy nowe tabele wg potrzeby (`tracks`, `integration_accounts`, `webhook_events`).
- Peaks wynoszone z `locals.tf` do `apps/api/seeds/peaks.json` (anti-pattern usunięty).

**Code (zmiany):**
- **Monorepo extract** — `sprawdzamszlak-frontend` → `apps/web`, kod Lambdy z `sprawdzamszlak-infrastructure/src/lambda_function.py` → `apps/api`, IaC do `infrastructure/`. pnpm workspaces.
- **Backend Python → TypeScript rewrite.** 102 LOC, ~1 dzień. Lambda runtime `nodejs22.x`, build przez `esbuild` (single-file bundle, no layers).
- **`packages/shared`** — zod schemas dla `Peak`, `Route`, `Track`, `StravaActivity`. Dzielone między `apps/api` i `apps/web/admin`.
- **`apps/web/admin`** — panel admin za auth. **Preferowany kierunek: basic auth z env var dla MVP** (single-user, ~2 minuty roboty). NextAuth z magic link via Resend (free tier 3000/mc) jako upgrade gdy będzie >1 user. Decyzja final w ADR-002.
- **GPX parser w `apps/api`** (`@tmcw/togeojson` lub `gpx-parser-builder`) — endpoint `POST /api/admin/upload`: GPX → parse → GeoJSON → S3 + metadata do DDB.
- **Strava OAuth + webhook** w `apps/api`: `GET /api/strava/oauth/callback`, `POST /api/strava/webhook` (signature verify). Token storage: szyfrowane w DDB z KMS-managed key (per-user, start single-user). Po webhook: fetch activity GPX/streams ze Stravy → S3 + DDB.

**IaC:**
- Terraform pozostaje. Lambda zip teraz buduje się z TS (esbuild bundle). `archive_file` data source zostaje, content się zmienia.
- Reszta IaC bez zmian (DDB tabele, S3 bucket, API GW route'y).

**Koszt:** **€0/mc forever** dla naszej skali (DDB PAY_PER_REQUEST forever-free pokrywa nas, Lambda free tier 1M req/mc forever, S3 free 5GB/12m a potem ~€0.02/mc, API GW $1.00/mln rq przy 1-5 webhooków/dzień = ~€0.001/mc).

**Czas migracji:** ~12-15 engineer-days (patrz Migration effort niżej). Mieści się w 6-tyg deadline.

**Plusy:**
- Storage zostaje — **najbardziej redukuje ryzyko deadline'u** (no schema migration, no data migration, no DNS cutover backendu).
- DDB free tier forever w naszej skali = €0/mc bez horyzontu.
- Mniej providerów (AWS + CF Pages) = mniej accountów, secrets, incident channels.
- Cold starts Lambda Node.js + esbuild ~50-150ms = OK dla Strava webhook (2s timeout).
- IAM + Terraform już skonfigurowane po security sweepie.
- Frontend bez zmian (CF Pages działa, nie ruszamy).

**Minusy:**
- DDB nie jest dopasowane do spatial queries — **akceptujemy** bo nie mamy use case'u (geometria po stronie klienta, GeoJSON w Leaflecie). Gdy pojawi się use case → ADR-006.
- Lambda + DDB + S3 + API GW = 4 warstwy AWS do debugowania. Akceptujemy bo już są skonfigurowane.
- Lock-in AWS dla storage. Mitigacja: dane domenowe są przenośne (JSON peaks, GeoJSON routes, surowe GPX w S3) — ewentualna przyszła migracja to skrypt eksportu, nie re-platforming pod presją.

**Ryzyko:** **niskie**. Modyfikujemy tylko kod, infra zostaje. Plan B (Strava nie domknie się w W5) jest realny — patrz Mitigations.

---

### Option B — Migrate to VPS + Postgres

Hetzner CX22 (€4.51/mc, 2 vCPU, 4GB RAM, 40GB SSD), Caddy reverse proxy, całość (Next.js + API) na jednym hoście. PostgreSQL 16 + PostGIS, `pg_dump` cron + offsite backup.

**Koszt:** ~€8/mc fixed (VPS + backups).

**Czas migracji:** 12-14 engineer-days.

**Dlaczego nie:**
- **Fixed cost** — sprzeczne z preferencją €0/mc właściciela.
- VPS + ssh + systemd + nginx setup = +1 dzień infra której właściciel nie zna na pamięć.
- Tracimy działający Cloudflare Pages → CF Pages flow.
- Single point of failure (1 host).
- Nie rozwiązuje problemu, który mamy (nie mamy spatial query problemu).

Zachowane jako **udokumentowana ścieżka ucieczki** gdyby AWS przestał być free / zaczął kosztować >€20/mc.

---

### Option C — Hybrid: Cloudflare Pages + Fly.io + managed Postgres (Neon/Supabase)

Frontend zostaje (CF Pages). Backend → Fly.io (Docker, free tier). Postgres managed (Supabase free 500MB DB + Auth + Storage 1GB; lub Neon 500MB DB).

**Koszt:** €0/mc dopóki w free tier, potem €5-15/mc po przekroczeniu Supabase/Fly limits.

**Czas migracji (zaktualizowany dla pełnego scope):** ~12-13 engineer-days.

**Dlaczego nie (mimo że to była pierwsza rekomendacja):**

1. **Free tier nie jest forever.** Supabase i Fly **zmieniają warunki** (Supabase pause projektów po 7 dniach inactivity na free; Fly podniósł ceny w 2024; Neon zmieniał compute hours kilka razy 2024-25). DDB free tier **jest forever** dla PAY_PER_REQUEST — to strukturalna różnica.
2. **Migracja DB pod tight deadline = ryzyko bez wartości.** Schema design + migracja danych + smoke testy + cutover = ~3-4 dni które wolimy wydać na Strava webhook stability.
3. **PostGIS to argument pod hipotetyczną przyszłość.** Nie mamy spatial query w v1. Najmniej-żałujmy decyzja: zostać na DDB **dopóki nie mamy konkretnego use case'u** wymuszającego PG.
4. **Trzy providery (CF + Fly + Supabase) > dwa (AWS + CF).** Każdy provider to konto, secrets, billing alert, incident channel. Mniej powierzchni > więcej.
5. **Provider risk × 3.** Fly miał kilka outages w 2024 (mniej dojrzały niż AWS). Supabase zmieniał warunki. CF Pages stabilne, ale dla frontu to już mamy.
6. **Lock-in Supabase Auth.** Przy ewentualnej migracji trzeba przepisać auth. Małe ryzyko (single user, magic link), ale realne.

Argument za C, który **odpada**: spatial features. Bez konkretnego use case'u, to YAGNI.

---

## Cost comparison (monthly, EUR, 12 month horizon)

| Opcja | Teraz (mc) | Triggery przejścia na paid | Horyzont 6m | Horyzont 12m | Po 12m |
|---|---|---|---|---|---|
| **A modified — AWS modernized (RECOMMENDED)** | **€0** | DDB free tier **forever** w PAY_PER_REQUEST. S3 free przekracza 5GB po 12m → ~€0.02/mc. API GW $1/mln rq przy ~5 rq/dzień = ~€0/mc. Lambda free 1M rq/mc forever. | **€0** | **€0-1** | **€0-2/mc** (dominanta: S3 storage GPX) |
| B — Hetzner + PG | €8 | Od dnia 1 (fixed) | €48 | €96 | €96+/12m |
| C — CF + Fly + Supabase | €0 | Supabase: >500MB DB, project pause po 7d inactivity (wake potrzebny). Fly: >3 VMs lub egress. Neon: compute hours. **Free tier może się zmienić w 12m.** | €0 | €0-15 | nieprzewidywalne |

**Kluczowa różnica:** DDB free tier **forever** ≠ Supabase/Fly free tier **dopóki firma chce**. Strukturalna asymetria na korzyść AWS dla naszego case'u (low-volume single-user).

**Realny koszt Option A modified w naszej skali:**
- Lambda: ~5-50 invocations/dzień = <2k/mc << 1M free → €0.
- DDB: ~50-200 read/write ops/dzień << forever-free limits → €0.
- S3: 100 GPX × ~50KB + 100 GeoJSON × ~30KB = ~8 MB. Forever w free tier. Po 12m = €0.0002/mc.
- API GW: ~150 rq/dzień = ~4500/mc. $1/mln × 0.0045M = $0.0045/mc → €0.
- CloudWatch logs: w free tier (5GB ingest free).

**Suma realnie: €0.00/mc forever w przewidywalnej skali.**

---

## Migration effort (engineer-days, solo, evening shifts)

Zakładając pełny scope: monorepo + TS rewrite + GPX upload endpoint + admin panel + Strava OAuth + Strava webhook.

| Zadanie | Engineer-days |
|---|---|
| Monorepo extract (`git filter-repo` × 2 repo, pnpm workspaces, tsconfig.base, pre-commit) | 1.0 |
| Python → TypeScript rewrite Lambdy (102 LOC, peaks/routes endpoints, esbuild bundle) | 1.0 |
| `packages/shared` — zod schemas (Peak, Route, Track, StravaActivity) | 0.5 |
| Peaks z `locals.tf` → `apps/api/seeds/peaks.json` + seed script (`scripts/seed-ddb.ts`) | 0.5 |
| GPX upload endpoint + parser + walidacja zod + S3 put + DDB put | 1.5 |
| Admin auth (basic auth z env var, middleware Next.js dla `/admin/*`) | 0.5 |
| Admin UI minimum (lista peaks/routes, upload form, edit metadata) | 1.5 |
| Strava OAuth flow (authorize → callback → tokens encrypted via KMS → DDB) | 1.0 |
| Strava webhook subscriber + signature verify + idempotency (DDB conditional write na `event_id`) | 1.5 |
| Strava activity fetch worker (sync, w hand-off z webhook handler — async via DDB Streams + drugi Lambda lub po prostu inline jeśli mieści się w 30s timeout) | 1.5 |
| Refresh token logic (Strava 6h expiry) | 0.5 |
| Terraform updates (nowe tabele DDB, nowe Lambda functions, nowe API GW routes, nowe IAM policies) | 1.0 |
| Smoke tests, manual E2E, soak | 1.0 |
| **Razem** | **~13 engineer-days** |

**Tłumacząc na kalendarz przy 15-20h/tydzień (3-4h wieczornie):** 13 × 8h = 104h ≈ **5-6 tygodni kalendarzowych**.

**Mamy 6 tygodni do 2026-06-15. Mieścimy się — z **~1 tyg buforem w W6**.** Plan jest realistyczny ale **nie luksusowy**. Patrz Sprint plan poniżej.

---

## Decision

**Wybieramy Option A modified.**

Konkretnie:

- **Storage zostaje na AWS:** DynamoDB (multi-table, PAY_PER_REQUEST, peaks + routes + nowe `tracks` + `integration_accounts` + `webhook_events`), S3 (GeoJSON + raw GPX), API Gateway HTTP v2, Lambda nodejs22.x.
- **Frontend zostaje na Cloudflare Pages.**
- **Terraform Cloud zostaje** dla state (re-evaluate w ADR-005 po-sezonie).
- **Backend rewrite Python → TypeScript** (esbuild bundle, runtime nodejs22.x).
- **Monorepo:** `apps/web` + `apps/api` + `packages/shared` + `infrastructure/terraform`. pnpm workspaces.
- **Admin auth dla MVP: basic auth z env var.** Decyzja final w ADR-002 (W3). Upgrade do NextAuth+Resend gdy zajdzie potrzeba.
- **GPX parser w `apps/api`** (`@tmcw/togeojson` lub `gpx-parser-builder` — wybór finalny w ADR-004).
- **Strava integration:** OAuth + webhook w `apps/api`, token encryption via KMS, idempotency w DDB.

### Dlaczego Option A, nie C

- **DDB free tier jest forever**, dla naszej skali nigdy nie zapłacimy. Supabase/Fly free tier mogą się zmienić.
- **Migracja DB pod tight deadline = niepotrzebne ryzyko.** Wolimy te 3-4 dni wydać na stabilność Stravy.
- **Spatial features (jedyny realny argument za PG) — YAGNI**, nie mamy use case'u w v1.
- **Mniej zewnętrznych dependency = mniej rzeczy do utrzymania** (CLAUDE.md "mała powierzchnia").
- AWS już skonfigurowane po security sweepie — nie burzymy działającego systemu.

### Dlaczego TS, nie Python

- **Shared zod schemas** między `apps/api` i `apps/web/admin` — single source of truth dla typów domeny.
- **Lepszy SDK Stravy w TS** (`strava-v3`, webhook signature helpers, refresh token utilities).
- **Jeden ekosystem npm** w monorepo — jeden lockfile, jeden language server, jeden test runner.
- **102 LOC do przepisania (~1 dzień).** Cost-benefit jednoznaczny.
- Cold start Node.js + esbuild bundle (~50-150ms) **lepszy** niż Python (~500-800ms) — istotne dla Strava webhook (2s timeout).

### Dlaczego nie Option B

- **VPS + ssh + systemd + nginx setup = +1 dzień** roboty na infrastrukturze, której właściciel nie zna.
- **Fixed cost €5-10/mc** = sprzeczne z "stay free as long as possible".
- Tracimy gotowy CF Pages → Pages, Lambda → terraform apply path.
- Single point of failure.
- Brak realnej wartości dodanej dla single-user low-volume.

---

## Consequences

### Positive

- **Realny koszt €0/mc forever** w przewidywalnej skali.
- **Najmniej zmian = najmniej ryzyka regresji** przed deadline'em. Storage layer nietknięty.
- **TypeScript end-to-end** — shared types, jeden ekosystem.
- **Plan B realistyczny:** jeśli Strava nie domknie się w W5, można odsunąć integrację o 2-3 tygodnie bez burzenia całego setupu.
- **AWS już skonfigurowane** po security sweepie — IAM, Terraform, secrets w Parameter Store gotowe.
- **Lambda Node.js cold start ~50-150ms** wystarcza dla Strava webhook (2s timeout).
- **DDB PAY_PER_REQUEST forever-free** w naszej skali — strukturalna asymetria względem alternatyw.

### Negative / risks

- **DDB nie jest dopasowane do geometrii.** Akceptujemy bo nie mamy use case'u. Gdy się pojawi → ADR-006 + osobna migracja po-sezonie.
- **Lock-in AWS** dla storage. Mitigacja: dane domenowe przenośne (JSON peaks, GeoJSON routes, surowe GPX w S3 — eksport skryptem).
- **Tight calendar:** 13 dni estymaty / 15-18 dni budżetu (6 tyg × 2.5-3 dni/tydzień). Bufor ~1 tydzień w W6.
- **W4-W5 (Strava) jest najbardziej ryzykownym oknem** — webhook subscription wymaga publicznego HTTPS + verify challenge, signature verify nietypowy, retry semantics Stravy mogą zaskoczyć.
- **Brak CI/CD** — deploy ręczny (`pnpm build && terraform apply`, `wrangler deploy` dla web). Akceptowalne dla solo dev na sezon. Follow-up w ADR-005.
- **Brak observability poza CloudWatch** — minimum: structured logs z request id w Lambda. UptimeRobot na public health endpoint (free).

### Mitigations

- **Plan B (Strava odsunięta):** decyzja **najpóźniej koniec W4 (2026-05-29)**: jeśli Strava nie wygląda na domknięcie do 2026-06-15, **odsuwamy integrację na koniec czerwca / początek lipca**. Pierwsze 1-2 tygodnie sezonu wycieczki wgrywane ręcznie GPX uploadem przez admin panel. Reszta scope dokończona.
- **Plan B+ (extreme):** jeśli W3 (cutover/admin panel) wygląda źle — **zostawiamy Lambda Python, tylko dodajemy Strava handler w Pythonie**, monorepo extract bez TS rewrite. Brzydkie, ale działa. Re-rewrite po-sezonie.
- **Rollback storage:** brak (storage się nie zmienia — to zaleta tej decyzji).
- **AWS shutdown nie jest celem** — AWS zostaje long-term. MFA root + Cost Anomaly Detection MUSZĄ być włączone do W3 (delegowane `security`).
- **Backup strategy:** DDB on-demand backup włączone (free tier do 25GB), S3 versioning włączone. ADR (placeholder) przed sezonem.

### Co musi się wydarzyć, żeby zmienić tę decyzję

- AWS zmienia DDB billing model i odpada PAY_PER_REQUEST forever-free → re-evaluate (mało prawdopodobne, AWS DDB pricing stabilny od lat).
- Pojawia się realny use case dla spatial query (`ST_Intersects`, `ST_DWithin`) — np. feature "pokaż peaks w 500m od mojej trasy" jako must-have → **ADR-006: Migracja DDB → Postgres** (osobny projekt po-sezonie, nie pod presją).
- Apka realnie się otwiera (>10 użytkowników) — re-evaluate (ten ADR nie pokrywa multi-user).
- Lambda cold start okazuje się problemem dla Stravy w praktyce → AWS Provisioned Concurrency (€2-3/mc) lub keep-warm (CloudWatch Events ping co 5min).

---

## Sprint plan / Roadmap (deadline 2026-06-15)

Założenia: **15-20h/tydzień** (3-4h wieczornie, ~6 dni roboczych w tygodniu). Każdy tydzień = 2-2.5 engineer-days. **Łącznie: 12-15 engineer-days budżetu vs 13 estymaty.** Bufor ~1 tydzień w W6.

### W1 (2026-05-02 → 2026-05-08): Monorepo extract + bootstrap

**Cel:** monorepo postawiony, oba repo wciągnięte z historią, build pipeline lokalny działa.

**Deliverables:**
- `sprawdzamszlak/` repo z `apps/web` (filter-repo z `sprawdzamszlak-frontend`) + `apps/api` (filter-repo z `sprawdzamszlak-infrastructure/src/`) + `packages/shared` (puste) + `infrastructure/terraform/` (filter-repo z `sprawdzamszlak-infrastructure/`, bez `src/`).
- pnpm workspaces, tsconfig.base.json, lint+typecheck pre-commit.
- `apps/api/build.ts` (esbuild bundle → `dist/handler.js`).
- Aktualizacja `infrastructure/terraform/lambda.tf`: `archive_file` source_dir wskazuje na `apps/api/dist/`, runtime `nodejs22.x` (nie wdrożone jeszcze, kod jeszcze Python — flag for W2).
- `.env.example` z placeholders dla nowych secrets (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_VERIFY_TOKEN`, `ADMIN_USER`, `ADMIN_PASS`).

**Exit criteria:**
- `pnpm install` na czystym clone działa.
- `pnpm -F web dev` startuje frontend lokalnie.
- `pnpm -F api build` produkuje `apps/api/dist/handler.js` (jeszcze stub, `{ statusCode: 200, body: 'hello' }`).
- Stara produkcja **dalej działa** (Python Lambda, DDB, frontend na CF Pages — nic nie ruszamy).

**Ryzyka:**
- `git filter-repo` może wymagać retries (zachowanie historii dla `infrastructure/`-bez-`src/`). Bufor 0.5 dnia.
- pnpm + Next.js 16 mogą mieć drobne hoisting issues (sharp, leaflet). Plan B: `npm` workspaces.

---

### W2 (2026-05-09 → 2026-05-15): TS rewrite Lambdy + shared package

**Cel:** Lambda nodejs22.x, TypeScript, na produkcji, parity z obecną Python Lambdą.

**Deliverables:**
- TS rewrite endpointów `GET /api/peaks` i `GET /api/routes` (Hono router lub raw API GW handler — wybór: raw, mniej deps).
- `packages/shared/src/schemas.ts` — zod schemas dla `Peak`, `Route`, `Track`, `StravaActivity`. Użyte w `apps/api` (parse input/output) i `apps/web` (typed API client).
- `apps/api/seeds/peaks.json` — peaks wyciągnięte z `locals.tf`.
- `apps/api/scripts/seed-ddb.ts` — seed script (idempotent, `PutItem` na każdy peak).
- Terraform: removal of `aws_dynamodb_table_item` resources z `locals.tf` (zastąpione seedem).
- `terraform apply` deployuje TS Lambdę.
- Smoke test: `curl https://<api-gw-url>/api/peaks` zwraca 24 peaks (parity).

**Exit criteria:**
- Produkcja na TS Lambda, frontend renderuje mapę identycznie.
- `pnpm -F shared build` produkuje typed exports używane w obu apps.
- Cold start zmierzony, <250ms p95 (acceptable dla Stravy).

**Ryzyka:**
- esbuild bundle z `aws-sdk` v3 — pamiętaj o externalize (`aws-sdk` jest provided przez Lambda runtime). Otherwise bundle 5MB+.
- DDB GetItem return shape różni się subtelnie między Python boto3 a TS @aws-sdk/client-dynamodb (`Marshalled` vs raw). Test edge cases.

---

### W3 (2026-05-16 → 2026-05-22): Admin panel skeleton + GPX upload

**Cel:** właściciel może zalogować się do `/admin` i wgrać GPX który ląduje w S3+DDB i renderuje na mapie.

**Deliverables:**
- ADR-002 napisane (Auth strategy: basic auth dla MVP, NextAuth+Resend jako upgrade path).
- ADR-004 napisane (GPX parser choice + S3 layout).
- Basic auth middleware w `apps/web/middleware.ts` dla `/admin/*` (env vars `ADMIN_USER`, `ADMIN_PASS`, hashed).
- `/admin` minimal UI: lista peaks (read-only), lista routes (read-only), form upload GPX.
- Endpoint `POST /api/admin/upload`: multipart form (max 10MB), parser (`@tmcw/togeojson`), walidacja zod (LineString, min 2 punkty), S3 put (raw GPX + GeoJSON), DDB put `tracks` (id, name, length, elevation_gain, s3_key_gpx, s3_key_geojson, created_at).
- Frontend renderuje tracks z DDB+S3 (extension istniejącego layeru routes).

**Exit criteria:**
- `https://sprawdzamszlak.pl/admin` wymaga basic auth.
- Upload .gpx z lokalnego pliku → po 5s widoczny na mapie.
- DDB `tracks` ma nowy item, S3 ma 2 obiekty (raw + geojson).

**Ryzyka:**
- API GW HTTP v2 ma payload limit 10MB — wystarczy dla GPX. Multipart parsing w Lambdzie wymaga `busboy` lub `lambda-multipart-parser`. Test wcześnie.
- GPX z różnych źródeł (Garmin/Strava/Mapy.cz) parsuje się różnie — przygotuj 3 sample files w W2, testuj w W3.

---

### W4 (2026-05-23 → 2026-05-29): Strava OAuth + webhook scaffolding

**Cel:** OAuth flow działa end-to-end (właściciel łączy konto Strava). Webhook subscription utworzony i odbiera HTTPS `GET` verify challenge.

**Deliverables:**
- ADR-003 napisane (Strava integration: sub_id management, signature verify, retry/idempotency).
- Strava developer app założona, secrets w AWS Parameter Store: `/sprawdzamszlak/strava/client_id`, `/.../client_secret`, `/.../verify_token`.
- KMS key dla token encryption (Terraform: `aws_kms_key`, alias `alias/sprawdzamszlak-tokens`). IAM policy: Lambda może `kms:Encrypt`/`kms:Decrypt` tylko ten key.
- DDB tabela `integration_accounts` (PK: `user_id`, attributes: `provider`, `access_token_ciphertext`, `refresh_token_ciphertext`, `expires_at`, `athlete_id`).
- DDB tabela `webhook_events` (PK: `event_id`, attributes: `provider`, `payload`, `received_at`, `processed_at`, `status`). TTL 30 dni.
- Endpoint `GET /api/strava/oauth/authorize` (redirect do Strava authorize URL).
- Endpoint `GET /api/strava/oauth/callback` (exchange code → tokens → encrypt → DDB put).
- Endpoint `GET /api/strava/webhook` (verify challenge handler — Strava sends `hub.challenge`, return `{ "hub.challenge": "..." }`).
- Strava webhook subscription utworzona (one-time `curl` POST do Strava API z verify token).
- `/admin/integrations/strava` UI: button "Connect Strava", status connected/disconnected, button "Disconnect".

**Exit criteria:**
- Właściciel klika Connect → autoryzuje na Stravie → wraca na `/admin` ze statusem "connected".
- DDB `integration_accounts` ma 1 wiersz z encrypted tokens.
- Strava webhook subscription `id` zwrócone i zapisane w Parameter Store (`/sprawdzamszlak/strava/subscription_id`).
- Verify challenge przeszedł (subscription created successfully).

**Ryzyka:**
- **Strava webhook subscription wymaga PUBLIC HTTPS endpoint w momencie tworzenia** — dlatego deploy musi być na produkcji **przed** `curl` POST do Strava. Test sequencing.
- KMS encryption: TS aws-sdk v3 ma boilerplate (`KMSClient`, `EncryptCommand`). Plan: helper `apps/api/src/crypto.ts` z `encryptToken(plaintext): Promise<string>` i `decryptToken(ciphertext): Promise<string>`.
- Strava OAuth scope: `activity:read,activity:read_all` — udokumentować w ADR-003.

---

### W5 (2026-05-30 → 2026-06-05): Strava E2E (webhook → fetch → save → render)

**Cel:** zakończona aktywność na Stravie pojawia się na publicznej mapie w ciągu 60s.

**Deliverables:**
- Endpoint `POST /api/strava/webhook` (rzeczywisty event handler):
  - Signature verify (Strava nie używa HMAC standard — używa `verify_token` w body + sprawdzenie source IP zalecane).
  - Idempotency: `PutItem` na `webhook_events` z condition `attribute_not_exists(event_id)`. Jeśli already exists → return 200 (Strava considers delivered).
  - Async hand-off: zapis eventu, return 200. Background processing przez DDB Streams + drugi Lambda (lub inline jeśli mieści się w 30s budget — preferowane dla simplicity).
- Strava activity fetcher: `GET https://www.strava.com/api/v3/activities/{id}` + `GET .../streams?keys=latlng,altitude` z access_token.
- Refresh token logic: jeśli `expires_at < now() + 5min`, refresh via `POST oauth/token` z `grant_type=refresh_token`, update DDB.
- Conversion: streams (latlng + altitude) → GeoJSON LineString → S3 put + DDB `tracks` put (provider=`strava`, source_activity_id=...).
- Frontend: tracks z `provider=strava` renderują się jako extension istniejącego layeru.
- Idempotency tested: ten sam webhook event 2x → tylko 1 track w DDB.

**Exit criteria:**
- Manual E2E: zapisz krótką aktywność na Stravie → w ciągu 60s widoczna na mapie.
- Refresh token tested: ręczne ustawienie `expires_at = now() - 1h` w DDB, kolejny webhook → token refresh → activity zapisany.
- Webhook delivery latency < 2s (Strava timeout) — verify w CloudWatch Logs.

**Ryzyka (HIGH — to najbardziej ryzykowny tydzień):**
- **Strava webhook signature** nie jest standard HMAC — używa `verify_token` w GET (challenge handshake) ale POST events nie mają signature. Polegamy na: (a) source IP allowlist (Strava docs nie publikuje stable IPs — fragile), (b) `subscription_id` match w body, (c) idempotency. **Akceptujemy security tradeoff** dla MVP, dokumentujemy w ADR-003.
- GPX z Stravy jest "punktowy" w activities typu "Virtual Ride" lub manual entry — fallback do 2D GeoJSON (no elevation) jeśli streams nie zawierają altitude.
- Rate limit Stravy: 100 req/15min, 1000/dzień. Dla naszego ruchu (1-5 webhooków/dzień) spokojnie, ale exponential backoff potrzebny w refresh logic.
- Lambda cold start + DDB query + Strava API call + S3 put + DDB put = ~1.5-2s p95. Blisko Strava timeout 2s. Mitigacja: async hand-off via DDB Streams (return 200 natychmiast po zapisie eventu).

---

### W6 (2026-06-06 → 2026-06-13): Soak time, bug fixes, ostatni tydzień przed sezonem

**Cel:** apka stabilna, monitoring działa, dokumentacja kompletna, gotowi na sezon. **Ten tydzień jest też buforem na W5 jeśli Strava się ślizga.**

**Deliverables:**
- 7-dniowy soak: codzienny smoke test, monitoring CloudWatch logs (errors, duration p95).
- Bug-fix sprint dla rzeczy znalezionych w W4-W5.
- **MFA root + Cost Anomaly Detection** zweryfikowane jako ON (delegowane `security` od W3, gate przed sezonem).
- DDB on-demand backup włączone (Terraform: `point_in_time_recovery { enabled = true }`).
- S3 versioning włączone na bucket GPX.
- UptimeRobot (free) na `https://sprawdzamszlak.pl/api/health` (5min interval).
- README.md update: jak deploy, jak rotate secrets, jak rollback Lambdy do poprzedniej wersji.
- `docs/runbook.md`: co robić gdy Strava webhook fail, gdy DDB throttling, gdy Lambda timeout.

**Exit criteria:**
- 7 dni bez incydentu na produkcji.
- Health endpoint zielony 24/7.
- Backup restore drill: ręczny `aws dynamodb restore-table-from-backup` na test table — udany.
- Wszystkie ADR-y W1-W5 zmergowane (ADR-002, ADR-003, ADR-004 minimum).

**Ryzyka:**
- **W6 jest buforem na W5.** Jeśli Strava webhook nie domknie się w W5 → soak skraca się do 3-4 dni, większe ryzyko niewykrytego buga.
- **Plan B trigger:** jeśli na koniec W4 widać że W5 nie domyka — odsuwamy Strava na 2-3 tygodnie po sezonie (decyzja 2026-05-29). Apka działa z manual upload.

---

### Total ryzyko kalendarzowe — szczerze

- **13 dni estymaty / ~15 dni budżetu** (6 tyg × 2.5 dni/tydzień).
- **Bufor: ~1 tydzień (W6).** To jest **realistyczny ale nie luksusowy plan**.
- **Najbardziej ryzykowny tydzień: W5 (Strava E2E).** Najwięcej unknowns: signature semantics nietypowy, retry behaviour Stravy, GPX stream variations, rate limits w praktyce.
- **Drugi najbardziej ryzykowny: W4 (Strava OAuth + KMS + webhook subscription bootstrap).** Pierwsze zetknięcie z Strava API, KMS boilerplate.
- **Plan B (Strava odsunięta o 2-3 tyg)** jest realny i zachowuje sezon. Trigger: koniec W4.
- **Plan B+ (zostać przy Python Lambdzie tylko dla Stravy)** jest ostatnim ratunkiem — brzydki, ale działa.

**Zostaję na DDB znacząco upraszcza plan.** W Option C dodatkowe 3-4 dni szły na schema design + migrację danych + cutover backendu — **te dni teraz są buforem na Stravę**.

---

## Resolved questions

1. **Skąd biorą się GeoJSON-y dziś:** ręczna konwersja GPX → wgrywane ręcznie do S3.
2. **Jak dodawać peaks/routes po migracji:** Strava auto-sync (dla aktywności) + admin panel za auth (dla peaks/manual upload/edycja).
3. **DNS:** Cloudflare (potwierdzone `dig`).
4. **MFA root + Cost Anomaly Detection:** UNANSWERED, **operational gate przed W3**. Delegowane `security`. AWS zostaje long-term, te wymagania nie znikają (jak by się stało w Option C po AWS shutdown).
5. **Akceptacja fixed cost:** **NIE** — €0/mc preferred forever. Option A modified spełnia (DDB free tier forever + Lambda free + S3 niemal free).
6. **Strava timing:** 2-4 tygodnie, **hard deadline 2026-06-15**. Plan B trigger na koniec W4.

---

## Follow-up ADRs needed

W kolejności priorytetu i terminu:

1. **ADR-004: GPX parser choice + S3 layout** — `@tmcw/togeojson` vs `gpx-parser-builder` vs `xml2js` + custom, max file size, walidacja (LineString tolerancje, 2D fallback dla brak elevation), idempotent slugs (hash of content?), S3 key layout (`raw/{date}/{slug}.gpx` + `geojson/{slug}.json`). **Termin: W3 (przed implementacją upload endpoint).**

2. **ADR-002: Auth strategy for admin panel** — basic auth z env var (preferred dla MVP) vs NextAuth + Resend magic link vs Clerk free tier. Single-user, simple. **Termin: W3 (przed implementacją admin middleware).** Preferowany kierunek już zapisany: **basic auth dla MVP**.

3. **ADR-003: Strava OAuth + webhook flow** — sub_id management (gdzie storage, jak rotate), signature verify approach (verify_token + idempotency, source IP allowlist?), retry/idempotency strategy (DDB conditional write), token refresh logic, rate limit handling (exponential backoff), KMS encryption details. **Termin: W4 (przed implementacją Strava handlerów).** Krytyczny dla deadline.

4. **ADR-005: CI/CD setup** — GitHub Actions + OIDC do AWS, deploy `apps/api` (terraform apply) + `apps/web` (CF Pages git integration już istnieje), preview environments. **Termin: po-sezonie (post 2026-06-15), low priority.** Deploy ręczny wystarcza na sezon.

5. **ADR-006: When to migrate to Postgres** — placeholder. Trigger: realny use case dla spatial query (`ST_Intersects`, `ST_DWithin`, klastrowanie po stronie serwera). Bez triggera **nie piszemy**. Dokument zaczyna istnieć dopiero gdy use case istnieje. **Termin: gdy/jeśli będzie potrzebne.**

ADR-002, ADR-003, ADR-004 są **na ścieżce krytycznej deadline'u**. ADR-005 i ADR-006 mogą poczekać do po-sezonie.

---

## References

- Audit report (auditor): zachowany w transcript pre-ADR.
- Security sweep: PRy zmergowane w `sprawdzamszlak-infrastructure` i `sprawdzamszlak-frontend`, `terraform apply` przeszedł.
- `CLAUDE.md` — sekcja "Stack — stan obecny i kierunki", filozofia "YAGNI agresywnie" + "mała powierzchnia".
- AWS DynamoDB pricing (PAY_PER_REQUEST forever-free): https://aws.amazon.com/dynamodb/pricing/on-demand/
- AWS Lambda free tier (1M req/mc forever): https://aws.amazon.com/lambda/pricing/
- Strava API: https://developers.strava.com/docs/reference/
- Strava webhooks: https://developers.strava.com/docs/webhooks/
- Cloudflare Pages (status quo): https://pages.cloudflare.com/

---

## Acceptance log

- **2026-05-02 (initial):** architect rekomendował **Option C** (Cloudflare Pages + Fly.io + Neon/Supabase Postgres + PostGIS + TS rewrite). Argumenty: PostGIS dopasowanie do geometrii, free tier, TS unification.
- **2026-05-02 (push-back):** Tomek odrzucił rekomendację, wskazał: (a) DDB free tier PAY_PER_REQUEST jest **forever**, nie wygasa po 12m jak inne services; (b) PostGIS to YAGNI bez konkretnego use case'u; (c) migracja DB pod tight deadline = niepotrzebne ryzyko; (d) mniej providerów = mniejsza powierzchnia (CLAUDE.md).
- **2026-05-02 (revised):** architect przepisał ADR pod **Option A modified** (zostajemy na AWS storage/compute, modernizujemy kod: monorepo + TS rewrite + admin panel + Strava integration). Argumenty właściciela włączone do Decision drivers i sekcji "Dlaczego nie Option C".
- **2026-05-02 14:30 (CET):** Status changed Proposed → Accepted by Tomek po review zrewidowanej wersji. Pytania 1, 2, 3, 6 odpowiedziane; 5 odpowiedziane (€0/mc forever via DDB free tier); 4 (MFA root + Cost Anomaly Detection) pozostaje **operational gate** delegowany `security`, termin pre-W3.
- **2026-05-03:** Operational gate from #4 closed — MFA on root AWS confirmed (always was, Google Authenticator), `aws_budgets_budget` $1/m and `aws_ce_anomaly_subscription` deployed to production.
- **2026-05-03:** **W1 executed end-to-end** via `scripts/w1-bootstrap.sh`. Monorepo `tlyko/sprawdzamszlak` created (private). Frontend (19 commits) merged into `apps/web/`, infrastructure split into `apps/api/src/` (7 commits) + `infrastructure/terraform/` (30 commits). pnpm install + esbuild build green. 7 backlog issues transferred. Old repos `sprawdzamszlak-frontend` and `sprawdzamszlak-infrastructure` archived. PR #8 awaiting owner review/merge. Lambda still runs Python in production — runtime change deferred to W2 per plan.
