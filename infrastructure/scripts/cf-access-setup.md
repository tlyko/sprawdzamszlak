# Cloudflare Access setup — `/api/admin/*` + `/plany/admin/*`

Setup runbook for ADR-008. Krok po kroku co owner robi **raz** end-to-end.

## Architektura (po PR 5b restructure)

```
Browser
  └─ sprawdzamszlak.pl/...
       └─ Cloudflare edge
            ├─ /api/admin/*    ┐ CF Access intercepts here
            ├─ /plany/admin/*  ┘ (one app, paths-list policy)
            │
            └─ Worker (apps/web/worker/index.ts)
                 ├─ /api/* → fetch() → AWS HTTP API → Lambda
                 └─ else   → env.ASSETS.fetch(req)  → Next static export
```

Wszystko żyje na `sprawdzamszlak.pl`. **Bez `api.` subdomeny, bez cross-origin auth, bez kombinowania z parent-domain cookie**. Jedna CF Access apka pokrywa obie ścieżki admin.

> **Stan po PR 5a (Lambda JWT verify) + PR 5b (Worker proxy):** Lambda umie weryfikować JWT, Worker proxyuje, ale CF Access apka jeszcze nie istnieje. Wszystkie `/api/admin/*` requesty zwracają 401 "missing JWT" (po populated SSM) lub 503 "auth not configured" (przed). To OK — gate zamknięty.

---

## Faza A — populated SSM placeholders

Bez tego /api/admin/ping zwraca 503 "auth not configured" — nie odróżnisz "gate works" od "gate down".

```bash
aws ssm put-parameter \
  --region eu-west-1 \
  --name /sprawdzamszlak/admin/owner_email \
  --type String \
  --value 'tlyko94@gmail.com'

# CF team domain — pełna wartość po Fazie B; placeholder OK na start.
aws ssm put-parameter \
  --region eu-west-1 \
  --name /sprawdzamszlak/cf-access/team_domain \
  --type String \
  --value 'placeholder.cloudflareaccess.com'

aws ssm put-parameter \
  --region eu-west-1 \
  --name /sprawdzamszlak/cf-access/aud \
  --type String \
  --value 'placeholder-aud-value-replace-me-after-cf-app-created-min32chars'
```

Smoke test:

```bash
curl -sI https://sprawdzamszlak.pl/api/admin/ping
# HTTP/2 401   ← gate trzyma, JWT verify rzuca UnauthorizedError
```

---

## Faza B — CF Access app

W CF Zero Trust dashboard:

1. **Access → Applications → Add an application → Self-hosted and private**.
2. Application form:
   - **Name:** `sprawdzamszlak admin`
   - **Domain / Destination:** `sprawdzamszlak.pl`
   - **Path:** zostaw puste — paths zdefiniujemy w policy / dodajemy dwa wpisy do destinations:
     - `sprawdzamszlak.pl/api/admin/*`
     - `sprawdzamszlak.pl/plany/admin/*`
   - **Session duration:** `24h` lub `30 days` — do woli.
3. **Policy:**
   - Name: `Owner only`
   - Action: `Allow`
   - Include selector: **Emails** → `tlyko94@gmail.com`
4. **Identity providers:** zostaw default (One-Time Pin / email magic link).
5. **Save**.

Po zapisaniu otwórz apkę → zakładka **Overview** lub w UI "Additional settings" → **AUD tag**. Skopiuj długi hex.

> Jeśli wizard pozwala tylko na jedną domenę + path, utwórz dwie aplikacje (jedna na `api/admin/*`, druga na `plany/admin/*`) z tą samą polityką. CF Access SSO obsłuży przejście między nimi w tym samym browser session na sprawdzamszlak.pl — bez parent-domain cookie hack, bo obie są na tym samym hostname.

---

## Faza C — wgraj prawdziwe wartości do SSM

```bash
# Twój team domain — Settings → General → "Team domain" w CF Zero Trust.
# Format: <team>.cloudflareaccess.com (np. sprawdzamszlak.cloudflareaccess.com).
aws ssm put-parameter \
  --region eu-west-1 \
  --overwrite \
  --name /sprawdzamszlak/cf-access/team_domain \
  --type String \
  --value 'sprawdzamszlak.cloudflareaccess.com'

# AUD — z apki "sprawdzamszlak admin" → Overview → "Application Audience (AUD) Tag".
aws ssm put-parameter \
  --region eu-west-1 \
  --overwrite \
  --name /sprawdzamszlak/cf-access/aud \
  --type String \
  --value '<aud-tag-z-app-overview>'
```

Lambda cache config czyści się przy cold starcie — w prod ~5 min spokoju potrzebne, albo `aws lambda update-function-configuration` żeby wymusić cold (zmienić cokolwiek w env).

---

## Smoke test pełnego flow

```bash
# Anonim — 401, gate trzyma
curl -sI https://sprawdzamszlak.pl/api/admin/ping
# HTTP/2 401  {"message":"unauthorized"}

# W przeglądarce:
# Otwórz https://sprawdzamszlak.pl/plany/admin/  (po PR 5c)
# albo bezpośrednio https://sprawdzamszlak.pl/api/admin/ping
# CF Access redirect → magic link na maila → kod → wracasz zalogowany
# Druga karta z curl/fetch z tej samej sesji → 200 + {"ok":true,"email":"..."}
```

---

## Wycofanie / rotacja

- **Sesja compromise** — w CF dashboard `Revoke session` na konkretnym użytkowniku, lub `Revoke` na całej apce.
- **Email change** — `aws ssm put-parameter --overwrite --name /sprawdzamszlak/admin/owner_email ...`. Lambda cold start (~5 min) lub force update funkcji.
- **Logout** — `https://<team>.cloudflareaccess.com/cdn-cgi/access/logout` w przeglądarce.

---

## Co jeśli CF jest wyłączone (incident, eksperymentowanie)

Lambda re-weryfikuje JWT lokalnie (defense-in-depth, ADR-008 D4):
- Brak `Cf-Access-Jwt-Assertion` → 401.
- Bad signature / wrong aud / wrong issuer → 401.
- Poprawny JWT z innego CF teamu → 401 (issuer mismatch).

Tzn. nawet bez CF przed Lambdą, `/api/admin/*` nie staje się otwarty.
