# Cloudflare Access setup — `/admin/*` endpoints

Setup ADR-008. Step-by-step what owner needs to do **once**, end-to-end. Pełna ścieżka rozłożona na trzy fazy: PR 2 (kod auth gate), PR 3 (custom domain), CF Access (manual w dashboardzie).

> **Stan po PR 2 (ten):** Lambda umie weryfikować JWT od CF Access, ale żaden CF Access app jeszcze nie istnieje. Wszystkie `/admin/*` requesty zwracają 401 "missing JWT" (po populated SSM) lub 503 "auth not configured" (przed). To OK — gate jest zamknięty bez CF, dokładnie tak ma być.

## Faza A — po merge PR 2: populated SSM placeholders

Bez tego /admin/ping zwraca 503 "auth not configured" — wciąż OK z punktu bezpieczeństwa, ale nie odróżnisz "gate works" od "gate down".

```bash
# Owner email (allowlist for /admin/*).
aws ssm put-parameter \
  --region eu-west-1 \
  --name /sprawdzamszlak/admin/owner_email \
  --type String \
  --value 'tlyko94@gmail.com'

# CF team domain — set during Faza C, but a placeholder is fine for now.
# (Lambda will start returning 401 once these are real and a request
# without JWT lands.)
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

Smoke test (na legacy URL, bo custom domain jeszcze nie wdrożona):

```bash
curl -sI https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/admin/ping
# HTTP/2 401
# < {"message":"unauthorized"}
```

Bez Authorization header — 401. ✅ Gate działa.

## Faza B — PR 3: custom domain `api.sprawdzamszlak.pl`

PR 3 wprowadzi:

- ACM cert dla `api.sprawdzamszlak.pl` (DNS validation — owner musi dodać CNAME).
- API GW custom domain + mapping prod stage → `/`.
- Output `api_gw_regional_domain_name` (target dla CF DNS CNAME).

Po merge PR 3 — pierwszy `terraform apply` **prawdopodobnie się wywróci** na walidacji certu (ACM czeka na CNAME). Owner:

1. Otwiera workflow run, czyta error.
2. Z `terraform plan` w PR comment wyjmuje validation records (`_xyz.api.sprawdzamszlak.pl → _abc.acm-validations.aws`).
3. W CF dashboard → DNS → adds CNAME (DNS only, gray cloud, **nie** orange).
4. Czeka 2-5 min, aż ACM validation flip do ISSUED (sprawdza w AWS Console → ACM).
5. Re-runs workflow `terraform.yml` przez `workflow_dispatch`. Apply kończy się czysto.

Następnie:

6. CF dashboard → DNS → adds CNAME: `api → <api_gw_regional_domain_name>` (z output Terraforma). **Orange cloud włączony** (proxied) — bez tego CF Access nie może osadzić auth gate.

## Faza C — CF Access app (manual w dashboardzie)

1. CF dashboard → **Zero Trust** (free plan, signup once jeśli brak).
2. **Settings → Custom Pages → Application Cookie Domain** → `sprawdzamszlak.pl`. To wymusza, żeby cookie `CF_Authorization` był scoped na parent domain — pozwala na SSO między `/plany/admin/*` (frontend) i `/admin/*` (API).
3. **Access → Applications → Add an application → Self-hosted**.
4. Konfiguracja aplikacji **#1: API admin gate**:
   - Name: `sprawdzamszlak API admin`
   - Application domain: `api.sprawdzamszlak.pl`
   - Path: `admin/*`
   - Session duration: 30 dni (lub krótsza, do wyboru)
   - Cookie settings → Application Cookie Domain: `sprawdzamszlak.pl`
5. Policy:
   - Name: `Owner only`
   - Action: `Allow`
   - Selector: `Email` → `tlyko94@gmail.com`
6. Identity providers: domyślnie One-Time Pin (email magic link) — wystarczy. Można dorzucić Google jako identity-provider jeśli wolisz one-click.
7. Save → CF wygeneruje **AUD tag** (widoczny w "Overview" tab apki). Zapisz, użyjesz w pkt. 9.
8. Powtórz dla aplikacji **#2: frontend admin gate**:
   - Application domain: `sprawdzamszlak.pl`
   - Path: `plany/admin/*`
   - Reszta — taka sama policy (Owner only).
   - **Cookie domain ten sam** (`sprawdzamszlak.pl`) — żeby SSO działał między obiema apkami.
9. Wgraj prawdziwe wartości do SSM:

```bash
# team_domain — Z headers: CF dashboard → Zero Trust → Settings → General →
# "Team domain". Format: <team>.cloudflareaccess.com (np. tomek.cloudflareaccess.com).
aws ssm put-parameter \
  --region eu-west-1 \
  --overwrite \
  --name /sprawdzamszlak/cf-access/team_domain \
  --type String \
  --value '<team>.cloudflareaccess.com'

# aud — z aplikacji #1 (API admin) → tab "Overview" → "Application Audience (AUD) Tag".
# Long hex string. Application #1 i #2 mają RÓŻNE AUD-y; tu wgrywamy AUD apki API.
aws ssm put-parameter \
  --region eu-west-1 \
  --overwrite \
  --name /sprawdzamszlak/cf-access/aud \
  --type String \
  --value '<aud-from-app-1>'
```

10. Smoke test pełnego flow:

```bash
# Bez auth — 401
curl -sI https://api.sprawdzamszlak.pl/admin/ping
# HTTP/2 401

# W przeglądarce:
# Otwórz https://sprawdzamszlak.pl/plany/admin/  (jak będzie po PR 4 gotowe)
# CF Access przekieruje na login → wpisz email → kod z maila → wracasz zalogowany.
# Otwórz https://api.sprawdzamszlak.pl/admin/ping w tej samej karcie.
# Cookie jest wspólne (cookie domain .sprawdzamszlak.pl), więc → 200 z {"ok":true,"email":"..."}.
```

Teraz `/admin/*` mają prawdziwy auth gate.

## Wycofanie / rotacja

- **Token compromise nie istnieje** — nie ma shared secret. Wystarczy w CF dashboard wyłączyć aplikację albo zmienić policy na puste.
- **Email change** — `aws ssm put-parameter --overwrite --name /sprawdzamszlak/admin/owner_email ...`. Cold start lambdy (~5 min) → cache wyczyszczony.
- **Logout** — otwórz `https://<team>.cloudflareaccess.com/cdn-cgi/access/logout` w przeglądarce. Czyści cookie wszystkich apek pod tym team domain.

## Co jeśli CF jest wyłączone (incident, eksperymentowanie)

Lambda re-weryfikuje JWT lokalnie. Jeśli requestor:
- Nie ma `Cf-Access-Jwt-Assertion` → 401 `unauthorized`.
- Ma JWT ale issuer/aud/sig się nie zgadzają → 401 `unauthorized`.
- Ma poprawny JWT z innego CF teamu → 401 (issuer mismatch).

Innymi słowy: nawet bez CF przed Lambdą, `/admin/*` nie staje się otwarty. To jest D4 z ADR-008.
