# ADR-008: Planowane wyjścia (`/plany/`) z auth via Cloudflare Access

**Date:** 2026-05-05
**Status:** Proposed
**Decision-maker:** Tomek (właściciel)
**Author:** Claude Code

## Context

Properietarski use case: właściciel ma w głowie listę szczytów na dany sezon. Chce dodawać/edytować/oznaczać status z poziomu UI strony, nie z palca w CLI.

Stan zerowy:
- Aplikacja jest single-user, ale serwowana publicznie na `sprawdzamszlak.pl`.
- Frontend = static export Next.js + Cloudflare Workers Static Assets. **Brak SSR, brak middleware, brak server-side cookie state.**
- API = AWS API Gateway HTTP API + Lambda (TS), URL `https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod` hardcodowany w 4 miejscach (audyt §3.3 #7).
- Strava OAuth flow (ADR-007) **nie tworzy sesji** użytkownika — to one-shot authorize, tokeny lądują w SSM, browser nigdy nie ma żadnej credentiali.
- ADR-002 (admin panel HTTP basic auth) zostało wycofane.

Nowe write-endpointy + write-UI to **pierwsza powierzchnia "logged-in user" w aplikacji.** Ergo: musimy zdecydować model auth, **nie wracając** do retrahowanych pomysłów (basic auth z W3, shared admin-token w localStorage).

## Decision drivers

1. **Bezpieczeństwo > prostota.** Single-user dziś, ale strona jest publiczna; nie chcemy żadnego shared-secret w localStorage (CSP ma `script-src 'unsafe-inline'` przez `output:'export'` Next.js — XSS-resistant model wymaga tokena, którego JS nie może odczytać).
2. **Solo-dev: minimalna powierzchnia kodu.** Nie piszemy własnego mechanizmu sesji, kryptografii, password hashingu, mailingu magic-linkiem. Każdy taki kawałek to dług na lata.
3. **Nie mieszamy z istniejącą Strava OAuth.** Strava OAuth ma scope `read,activity:read_all` — nie powinien być proxy do "session" w naszym appie.
4. **Free / niski koszt.** Cloudflare Access free tier do 50 userów wystarczy na zawsze dla tego projektu.
5. **YAGNI:** żadnych ról, organizacji, audit-logów, MFA-self-service. Owner-only policy = jedna reguła.

## Decision

### D1 — Cloudflare Access jako warstwa auth

Wszystko, co chronione, gatuje **Cloudflare Access**:

- **Frontend:** `sprawdzamszlak.pl/plany/admin/*` — dostęp tylko po logowaniu CF Access (One-Time Pin na maila właściciela).
- **Backend:** wybrane endpointy `/admin/*` na `api.sprawdzamszlak.pl` (zob. D2) — ten sam mechanizm, ten sam policy.

Polityka jednowierszowa: `email == tlyko94@gmail.com`. Zmiana w przyszłości = jedna linijka w dashboardzie / Terraform.

**Co Cloudflare Access daje za free:**

- One-Time Pin email (lub Google SSO, GitHub, etc.) jako identity provider.
- Podpisany JWT (CF certs, RS256) wstrzykiwany w nagłówek `Cf-Access-Jwt-Assertion` na każdy authenticated request idący do origin.
- Cookie `CF_Authorization` (httpOnly) — JS nie ma dostępu, nie ma ścieżki XSS na sesję.
- Konfigurowalna długość sesji (default 24h, można rozszerzyć).
- Logout: pojedynczy URL CF Access wylogowuje wszystkie chronione apki.

**Co Cloudflare Access NIE robi:**

- Nie autoryzuje per-row (właściciel widzi/zmienia wszystko).
- Nie zna nazw użytkowników aplikacji — operuje tylko na e-mailach.

### D2 — API GW na własnej subdomenie `api.sprawdzamszlak.pl`

Cloudflare Access wymaga, żeby chroniona origin była za Cloudflare DNS (proxied / orange cloud). Obecne `*.execute-api.eu-west-1.amazonaws.com` jest poza CF.

**Plan:**

1. AWS ACM cert dla `api.sprawdzamszlak.pl` (DNS-validation przez CF DNS — record dodaję ręcznie lub TF).
2. API GW `aws_apigatewayv2_domain_name` + `aws_apigatewayv2_api_mapping`.
3. CF DNS: `CNAME api → <api-gw-cf-domain>` z włączonym proxied / orange cloud.
4. Frontend: **jeden** `apps/web/lib/api-base.ts` reading `NEXT_PUBLIC_API_BASE_URL` z env, default `https://api.sprawdzamszlak.pl`. Likwiduje hardcode'y z audytu §3.3 #7.
5. Stary endpoint `akoz890bg6.execute-api...` jest dalej żywy (API GW tego nie wyłącza). Po jakimś czasie stable = blokujemy origin policy żeby przyjmował tylko Host: api.sprawdzamszlak.pl. Albo zostaje jako backup. Decyzja w konsekwencjach.

### D3 — Cookie scope `.sprawdzamszlak.pl` (parent domain)

Cloudflare Access app config: **Application Cookie Domain = `sprawdzamszlak.pl`**. Wówczas:

- Login na `sprawdzamszlak.pl/plany/admin/` ustawia `CF_Authorization` cookie scoped na `.sprawdzamszlak.pl`.
- Browser auto-wysyła cookie na requesty do `api.sprawdzamszlak.pl/admin/*` (parent-domain match).
- CF Access weryfikuje cookie na obu apkach z tej samej polityki — single sign-on bez dodatkowej redirection.

Wymaga: **dwóch CF Access applications z tą samą polityką** (frontend admin path + API admin path), oba z cookie domain ustawionym na `sprawdzamszlak.pl`.

### D4 — Lambda weryfikuje JWT (defense-in-depth)

CF Access już blokuje request jeśli JWT brakuje / jest invalid. **Mimo to** Lambda na `/admin/*` re-weryfikuje JWT:

- Pobiera publiczne klucze CF z `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` (cache w-process; rotacja kluczy CF rzadka).
- `jose.jwtVerify(jwt, jwks, { issuer, audience })` — sprawdza signature, expiry, audience (AUD tag z app config), issuer (team domain).
- Sprawdza `email` claim == `tlyko94@gmail.com`.
- Jeśli verification fail → 401, **nie** 403, żeby było jasne że to auth nie authorization.

**Dlaczego defense-in-depth:** jeśli kiedyś API zostanie wyciągnięte spoza CF (debug, custom header bypass z misconfig), Lambda nie staje się otwartym CRUD-em. Plus własna weryfikacja oznacza że logika "kto jest ownerem" żyje w jednym miejscu w kodzie, nie tylko w policy w dashboardzie.

### D5 — Schema danych: nowa tabela `sprawdzamszlak-plans`

```
PK   id           string (uuid v4)
     peak_slug    string  (FK do sprawdzamszlak-data; walidacja przy POST)
     target_year  number  (np. 2026)
     target_month number  (1-12, opcjonalne)
     status       enum    ('planned' | 'done' | 'skipped')
     route_idea   string  (free text, max 500 zn., opcjonalne)
     notes        string  (free text, max 4000 zn., opcjonalne)
     strava_id    string  (opcjonalne; wypełniane gdy status='done')
     created_at   number  (epoch s)
     updated_at   number  (epoch s)
```

- Osobna tabela (nie singletable z `routes`) — inny cykl życia, inna semantyka, inne access patterns. Konsystencja z istniejącymi tabelami `sprawdzamszlak-{data,routes,strava-events,strava-oauth-states}`.
- `id` jako uuid (nie hash z palca) — pozwala bezpiecznie POST-ować bez koordynacji.
- `peak_slug` walidowane przy zapisie (lookup do `sprawdzamszlak-data`); jeśli szczyt nie istnieje, 400.
- `strava_id` opcjonalne — link do trasy w `routes` po fakcie wyjścia. Frontend renderuje wówczas link "→ kronika".
- TTL: brak. Plany są częścią kroniki.
- PITR: enabled (jak inne tabele po §5.4 audytu).
- Deletion protection: enabled.

### D6 — Endpointy

**Public (no auth):**

- `GET /plans` — pełna lista planów (publicznie, bo to publiczna kronika; zob. konsekwencje).

**Admin (CF Access + JWT verify):**

- `POST   /admin/plans`         — body: `{peak_slug, target_year, target_month?, route_idea?, notes?, status?}`. Domyślnie `status='planned'`. Generuje `id`, `created_at`, `updated_at`.
- `PATCH  /admin/plans/{id}`    — body: częściowy update. Walidacja jak POST. `updated_at` aktualizowane.
- `DELETE /admin/plans/{id}`    — twarde delete (nie soft-delete; YAGNI).

Walidacja wszystkich body via zod w `packages/shared` (consistent z resztą — `RouteSchema`, `StravaTokensSchema`).

### D7 — Frontend

- **`/plany/`** — public read-only:
  - Lista planów grupowana po `target_year`.
  - Filtr: status (planned/done/skipped) + sezon.
  - Każdy plan: peak name + height + route_idea + status badge + (jeśli `strava_id`) link "→ kronika".

- **`/plany/admin/`** — write UI (gated CF Access):
  - Form "+ dodaj plan": peak picker (dropdown z `sprawdzamszlak-data`, sortowany alfa), `target_year` select (default = current year), `target_month` select (opcj.), textarea `route_idea`, textarea `notes`.
  - Lista planów z inline edit + delete buttonem.
  - Stan loading/error inline (toast).
  - Brak własnego "logout" — link do `/cdn-cgi/access/logout` (CF default).

## Consequences

### Positive

- Brak shared-secret w aplikacji. Sesja = signed JWT od CF, httpOnly cookie. **XSS przestaje być wektorem na auth.**
- Single sign-on dla całej domeny — login raz, dostęp do `/plany/admin` i admin endpointów.
- Logging in i out w jednym miejscu (CF dashboard / `/cdn-cgi/access/logout`).
- Identity provider plug-in: dziś OTP, jutro Google/GitHub/Okta, zmiana w 1 dropdown.
- Defense-in-depth: nawet jeśli CF Access zostanie obejście, Lambda nie ufa.
- Kasujemy hardcode'y URL-i w 4 plikach (audyt §3.3 #7) jako efekt uboczny D2.
- API ma "ładny" URL — `api.sprawdzamszlak.pl` — vs hex-string z exec-api.

### Negative / risks

- **Custom domain na API GW.** Trzeba ACM cert (DNS validation), `aws_apigatewayv2_domain_name`, mapping. Plus CF DNS record. ~2-3h setup + propagation.
- **Cookie domain `sprawdzamszlak.pl`** wymaga, żeby BOTH apki (frontend + API) były na tej samej apex domain. Subdomena `api.sprawdzamszlak.pl` to spełnia.
- **CF Access policy w dashboardzie, nie Terraform.** Można dorzucić `cloudflare` provider do TF, ale dziś nie zarządzamy CF z TF. **Decyzja:** zostawiamy w dashboardzie + linkujemy z ADR + dokumentacja w `infrastructure/scripts/cf-access-setup.md`. Jak będzie więcej polityk → migracja do TF.
- **Stary endpoint `akoz890bg6...` zostaje aktywny.** Bez jawnego blokowania per-host, write endpointy (`/admin/*`) na tej origin **nie mają** CF Access przed sobą. Ale: na tym URL-u API GW jest, ale CF Access nie jest, więc writes potencjalnie idą w obejście. **Mitigacja:** Lambda na `/admin/*` wymaga JWT (D4) — bez CF nie ma JWT-a → 401. Defense-in-depth stoi. Plus CORS allowlist (tylko sprawdzamszlak.pl + workers.dev + localhost).
- **Cloudflare lock-in.** Jeśli kiedyś migracja off-CF, trzeba zastąpić auth. Skala migracji ≈ przeniesienia DNS + CF Access policies → np. własny OAuth/OIDC. Akceptowalne na cele MVP.
- **OTP email per login** może być irytujące (default 24h sesja). Można rozszerzyć w app config do 30d.

### Mitigations

- API GW custom domain wprowadzane w **osobnym PR-ze**, walidowane przez `terraform plan` w PR comment.
- CF Access setup udokumentowany krok-po-kroku w `infrastructure/scripts/cf-access-setup.md` (manual: jak ktoś inny/przyszły-ja będzie odtwarzać).
- JWT verification: użyjemy `jose` library (~7kb gzipped, AWS Lambda-friendly, no native deps). Cache JWKS in-process; fetch raz per cold start.
- Smoke test po każdym deployu: `curl -i https://api.sprawdzamszlak.pl/admin/plans` z brakiem cookie/JWT → musi być 401.

## What this changes in earlier ADRs

- **ADR-002 (admin panel HTTP basic auth):** pozostaje superseded. To jest następna iteracja "kto jest ownerem" — bez basic auth, bez password storage, bez admin lambdy.
- **ADR-007 (Strava OAuth start page):** bez zmian. Strava OAuth flow nie ma związku z plans-admin auth; oba żyją obok siebie.
- **CLAUDE.md "Czego NIE robimy":** pozycja "Nie wprowadzamy Lambdy Layers / Step Functions / SQS / SNS bez konkretnej potrzeby" zachowana. CF Access nie wpada w żadną z tych kategorii — jest external SaaS, nie kolejnym AWS service.

## Roadmap implementation (osobne PR-y)

Każdy PR zielony zanim zaczynam następny:

1. **PR 1:** `docs/adr-008` — ten dokument. Sign-off przed zmianami w infra. **(ten PR)**
2. **PR 2:** API custom domain + CF DNS + ACM cert (Terraform). Mock endpoint `/admin/ping` zwracający 200. CF Access app skonfigurowany manualnie, udokumentowany w `infrastructure/scripts/cf-access-setup.md`. Smoke test: bez auth `/admin/ping` → 401, z auth → 200.
3. **PR 3:** Lambda JWT verify middleware + DDB tabela `plans` + endpointy `GET /plans` (public), `POST/PATCH/DELETE /admin/plans/*`. Bez UI. Test: curl + smoke z JWT.
4. **PR 4:** Frontend `/plany/` (public list) + `/plany/admin/` (write UI). Likwidacja hardcoded API URL-i (audyt §3.3 #7) jako efekt uboczny.
5. **PR 5 (opcjonalnie):** integracja "→ kronika" — gdy plan ma `strava_id`, link do `/trasy/strava-{id}/`. Może wskoczyć w PR 4 jeśli małe.

## When this decision is revisited

- **Multi-user:** każdy user widzi tylko swoje plany. Wtedy `id` PK + GSI po `email`, plus walidacja w Lambdzie że `email z JWT == email w wierszu`.
- **Off-Cloudflare migration:** wymienić CF Access na własny OAuth/OIDC provider. Backend już ma JWT-verify, podmieniamy issuer/jwks URL.
- **Audit log requirement:** dorzucić tabelę `admin-events` z append-only logiem zmian — kto, kiedy, co.
- **Mobile native app:** CF Access service tokens dla device auth, ale dziś single-user web-only, YAGNI.

## References

- ADR-001, ADR-007 (kontekst Strava OAuth + monorepo).
- ADR-002 (superseded — kontekst dlaczego basic auth nie wraca).
- audyt 2026-05-05 §3.3 #7 (hardcoded API URL — likwiduje to PR 4).
- Cloudflare Access docs: <https://developers.cloudflare.com/cloudflare-one/identity/idp-integration/one-time-pin/>
- CF Access JWT verification: <https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/>
- API GW v2 custom domain: <https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-custom-domain-names.html>
