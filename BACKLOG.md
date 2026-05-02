# Backlog — security & hardening

Issues do otworzenia w GitHubie po zamknięciu Critical security incident (2026-05-01). Każda sekcja gotowa do skopiowania jako issue body — tytuł nad headerem, treść poniżej.

Repozytoria:
- `tlyko/sprawdzamszlak-infrastructure` — issues z prefiksem H/M dotyczące Terraforma, Lambdy, AWS
- `tlyko/sprawdzamszlak-frontend` — issues dotyczące Next.js / TatraMap

Klasyfikacja severity z security sweep raport (`security` agent, 2026-05-01).

---

## H1 — Lambda 500 response leaks AWS resource info via str(e)

**Repo:** `sprawdzamszlak-infrastructure`
**Severity:** High
**File:** `src/lambda_function.py:94-96`

Generic exception handler zwraca `Internal Server Error: {str(e)}` w response body. Boto3 wyjątki zawierają nazwy tabel, ARNy zasobów, czasem account ID — atakujący przez zniekształcony JSON / nieistniejący item dostaje informacyjny payload o naszej infrze.

**Fix outline:**
```python
import logging, uuid
logger = logging.getLogger()
logger.setLevel(logging.INFO)

except Exception:
    rid = context.aws_request_id if context else str(uuid.uuid4())
    logger.exception("Handler crashed", extra={"request_id": rid})
    return create_error_response(500, f"Internal error (id={rid})")
```

Stack trace ląduje w CloudWatch (mamy retention 14d), klient dostaje tylko nieprzezroczyste request id do podania w supporcie.

---

## H2 — No request body size or shape validation in Lambda

**Repo:** `sprawdzamszlak-infrastructure`
**Severity:** High
**File:** `src/lambda_function.py` (handler GET — POST został usunięty w PR #1)

Choć POST już nie istnieje, GET handler nadal akceptuje arbitrary input z path/query/headers bez walidacji. Gdy wrócimy do POST (np. z auth dla admin panelu), trzeba mieć:
- limit rozmiaru body (np. 32KB)
- explicit JSON parse z try/catch
- allow-list pól (whitelist na klucze przed put_item)
- regex/schema dla `id` (np. `[a-z0-9_-]{1,64}`)

**Fix:** wprowadzić `pydantic` (lub własny mini-validator) — patrz security sweep raport sekcja H2.

---

## H3 — Defense-in-depth: filename allowlist before S3 presigned URL

**Repo:** `sprawdzamszlak-infrastructure`
**Severity:** High
**File:** `src/lambda_function.py:67-74`

`s3_key = f"trails/{item['filename']}"` opiera się na zawartości DynamoDB. IAM polityka zawęża dostęp do `arn:aws:s3:::bucket/trails/*` więc traversal `..` jest zablokowany przez S3, ale defense-in-depth wymaga walidacji w handlerze.

**Fix:**
```python
import re
SAFE_FILENAME = re.compile(r"^[a-z0-9_]{1,64}\.geojson$")
filename = item.get('filename', '')
if not SAFE_FILENAME.fullmatch(filename):
    continue  # skip route with invalid filename
```

---

## H4 — DynamoDB needs encryption / PITR / deletion_protection declared

**Repo:** `sprawdzamszlak-infrastructure`
**Severity:** High
**Files:** `dynamodb.tf` (obie tabele)

Brak jawnych bloków `server_side_encryption`, `point_in_time_recovery`, `deletion_protection_enabled`. PITR is off by default → utrata danych przy `terraform destroy` lub błędnym `apply` jest możliwa.

**Fix:** dla każdej tabeli:
```hcl
deletion_protection_enabled = true
server_side_encryption { enabled = true }
point_in_time_recovery   { enabled = true }
```

PITR kosztuje ~$0.20/GB/m — dla naszej skali grosze.

---

## H5 — S3 bucket needs explicit versioning / SSE / TLS-only / ownership

**Repo:** `sprawdzamszlak-infrastructure`
**Severity:** High
**Files:** `s3.tf`

Public access block jest OK. Brakuje:
- `aws_s3_bucket_server_side_encryption_configuration` (AES256)
- `aws_s3_bucket_versioning` (Enabled)
- `aws_s3_bucket_ownership_controls` (BucketOwnerEnforced — wyłącza ACLs)
- bucket policy z deny dla `aws:SecureTransport=false`

**Fix:** patrz security sweep raport sekcja H5 (gotowe HCL bloki).

---

## H7 — DynamoDB Scan should have Limit + paginate cursor to client

**Repo:** `sprawdzamszlak-infrastructure`
**Severity:** High → Medium (zależnie od skali tabel)
**File:** `src/lambda_function.py:49-53, 59-63`

`scan()` z paginacją do końca tabeli — przy 24 peaks dziś OK, przy 1000+ to RCU drain. Atakujący jednym GET wymusza pełen sweep tabeli.

**Fix krótkoterminowy:** dodać `Limit=200`, zwracać `LastEvaluatedKey` jako cursor w response.
**Fix długoterminowy (po ADR-001):** redesign na Postgres + indeksy lub single-table DDB z prefix queries.

---

## M2 — Frontend missing security headers (CSP, HSTS, X-Frame-Options, etc.)

**Repo:** `sprawdzamszlak-frontend`
**Severity:** Medium
**File:** `next.config.ts` (obecnie pusty boilerplate)

Brak: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS.

**Fix:** dodać `async headers()` w `next.config.ts` z setem nagłówków — patrz security sweep raport sekcja M2 (gotowy snippet z CSP dopasowanym do leaflet + OSM tiles + nasze API GW). Cloudflare Pages respektuje `next.config.ts` headers w produkcji.

---

## Lower priority (M3-M7, I1-I9) — odłożone

Pozostałe punkty z security sweep raportu (M3 deployment auto_deploy, M4 IAM trim, M6 metadata + lang, M7 next-env.d.ts, I1-I9 hardening) — kosmetyka. Otwórz osobne issues w razie potrzeby albo zaadresuj przy okazji większego refactoru w ramach migracji do monorepo (ADR-001).

---

## Operational TODO (poza issue trackerem)

- [ ] **Włączyć MFA na root AWS account** — sprawdzić w konsoli, jeśli brak: dodać. Wymagane przed publicznym otwarciem.
- [ ] **Włączyć AWS Cost Anomaly Detection** w Console (1 minuta) — komplementarne do `aws_budgets_budget` (proaktywne wykrywanie nietypowych skoków, nie tylko thresholdy).
- [ ] **Sprawdzić Terraform Cloud** — czy organization `sprawdzamszlak-org` ma 2FA na koncie HCP. Te creds mają de facto root access do AWS przez TF apply.
