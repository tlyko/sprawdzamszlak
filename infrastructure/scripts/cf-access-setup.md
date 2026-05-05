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

PR 3 wprowadza:

- ACM cert dla `api.sprawdzamszlak.pl` (DNS validation — owner musi dodać CNAME).
- `aws_acm_certificate_validation` z 30-min timeoutem — apply zatrzymuje się tu i czeka aż CNAME się propaguje.
- API GW custom domain + mapping prod stage → `/`.
- TF outputs: `api_cert_validation_records`, `api_custom_domain_target`, `api_custom_domain_url`.

### Krok po kroku po mergu PR 3

1. **GHA odpala terraform apply.** Cert resource powstaje (PENDING_VALIDATION), potem `aws_acm_certificate_validation` zaczyna pollować ACM. Apply staje na tym kroku — to OK, czeka na CNAME.

2. **Owner: zdobądź validation records.** Equivalent do TF outputu (TF tu jeszcze nie pisze outputów — apply nie skończony):

   ```bash
   ARN=$(aws acm list-certificates --region eu-west-1 \
     --query 'CertificateSummaryList[?DomainName==`api.sprawdzamszlak.pl`].CertificateArn' \
     --output text)
   aws acm describe-certificate --region eu-west-1 --certificate-arn "$ARN" \
     --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
   ```

   Wynik:

   ```json
   {
     "Name":  "_xyz123.api.sprawdzamszlak.pl.",
     "Type":  "CNAME",
     "Value": "_abc456.xxxxxx.acm-validations.aws."
   }
   ```

3. **CF dashboard → DNS → Add record (DNS only, gray cloud, NOT proxied):**
   - Type: `CNAME`
   - Name: `_xyz123.api` (CF strippuje sufiks zone'a — wpisujesz tylko prefix)
   - Target: `_abc456.xxxxxx.acm-validations.aws.`
   - Proxy status: **DNS only** (gray cloud).

4. ACM auto-pollule co ~minutę. Po 1-3 min `terraform apply` rusza dalej (nie musisz nic robić — TF poll co kilkadziesiąt sekund).

5. **Jeśli przegapisz 30-min okno** — apply kończy się timeoutem. Re-run workflow `terraform.yml` przez `workflow_dispatch`. Drugi apply: cert już ISSUED, validation resource przechodzi natychmiast, reszta zasobów dokończona.

6. Apply kończy się sukcesem. **Czytaj outputy:**

   ```bash
   cd infrastructure/terraform
   terraform output api_custom_domain_target  # np. d-abc123.execute-api.eu-west-1.amazonaws.com
   terraform output api_custom_domain_url     # https://api.sprawdzamszlak.pl
   ```

7. **CF dashboard → DNS → Add record (proxied, orange cloud):**
   - Type: `CNAME`
   - Name: `api`
   - Target: wartość z `api_custom_domain_target` (bez końcowej kropki w UI CF).
   - Proxy status: **Proxied** (orange cloud) — bez tego CF Access nie może osadzić auth gate.

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
