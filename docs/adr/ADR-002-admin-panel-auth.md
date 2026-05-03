# ADR-002: Auth strategy for the admin panel

**Date:** 2026-05-03
**Status:** Accepted
**Decision-maker:** Tomek (właściciel)
**Author:** architect (continuation of ADR-001 follow-ups)

## Context

ADR-001 introduced an admin panel under `apps/web/admin` (planned for W3) for managing peaks, manually uploading GPX, and editing metadata. The panel will run alongside the public Next.js frontend on Cloudflare Pages.

Use case constraints:

- **Single user** (Tomek) for the foreseeable future. No multi-tenant requirements.
- **Stay in free tier as long as possible** (ADR-001 hard constraint). No paid auth provider.
- **Hard deadline 2026-06-15** (Strava season). Anything that takes more than half a day eats into W4-W5.
- **Mobile-friendly login** (Tomek will sometimes upload from phone in the field).
- **Admin endpoints in `apps/api`** must also be auth-protected — the same secret/token model has to span both Next.js routes (web) and Lambda (api).

## Decision drivers

1. **Time to working MVP** (ranked highest given the deadline).
2. **No paid services**.
3. **Simple to operate** — one person rotates secrets, no provider config sprawl.
4. **Reasonable security** — admin can mutate DDB data; an unauthenticated bypass is a real risk.
5. **Migratable** — when the project opens up to multiple users (years away, but possible), the chosen approach should not box us in.

## Considered options

### Option A — Basic auth via env var (RECOMMENDED for MVP)

Set `ADMIN_USER` and `ADMIN_PASS` (long random) in Cloudflare Pages env and Lambda env. Both `apps/web/admin/*` routes (Next.js middleware) and `apps/api`'s `/admin/*` paths check the `Authorization: Basic …` header.

**Pros:**
- Zero new dependencies, zero new providers.
- 30 minutes to wire up end-to-end.
- Works the same on web and Lambda — single password rotation point.
- Browser native UI for the prompt; mobile-friendly.

**Cons:**
- One shared password — no per-device sessions.
- No 2FA path without rebuilding.
- Browsers cache the Authorization header until tab close — fine for one user, awful for many.
- Logs / proxies can capture the header if TLS terminates somewhere unexpected (we go straight to API GW, so this is theoretical).

### Option B — NextAuth.js (Auth.js) with magic link via Resend

NextAuth.js with `EmailProvider` + Resend (free tier 3000 emails/m, more than enough). Sessions via signed JWT cookies. Admin routes check session.server-side; API verifies Lambda authorizer over the same JWT (or a backend-to-backend secret).

**Pros:**
- No password — magic link to email; works across devices.
- 2FA-equivalent: anyone needs inbox access.
- Clean upgrade path to multi-user later (just add allowlisted emails).

**Cons:**
- ~1 day to wire up: NextAuth config, Resend setup, JWT verification in Lambda, email template, dev-mode email shim.
- Needs a session store (DDB or Cloudflare KV) — more moving parts.
- Cold start on Lambda grows with `jose` dep.
- Email delivery latency (10-90s typically) makes admin tab refresh annoying in the field.

### Option C — Cloudflare Access (Zero Trust)

Cloudflare Access in front of `apps/web/admin/*` and `apps/api/admin/*` (the latter via a Cloudflare Worker proxy). Login through Cloudflare's IdP picker (Google, Email OTP, etc.).

**Pros:**
- No code changes for admin auth — pure infra.
- Free tier: 50 users (we use 1).
- Strong: hardware key, Google SSO, audit log.

**Cons:**
- Adds Cloudflare Worker in front of Lambda → another moving piece, latency budget pressure (W5 risk).
- API GW custom domain configuration to fit Cloudflare in front.
- Vendor lock-in to Cloudflare for the admin path; harder to migrate away later.
- Operationally heavier than B for first-time setup.

## Decision

**Option A — basic auth via env var.** Clean MVP fit; zero risk for the deadline; trivially replaceable in a future ADR if/when this project ever serves more than one person. The password rotation cost is one `terraform apply` (Lambda env) + one Cloudflare Pages dashboard edit.

The implementation pattern in W3:

- **Web (`apps/web/admin/*`)** — **the admin route is a regular static page**. The frontend was migrated to `output: 'export'` for Cloudflare Workers + Static Assets (W2 cutover, see ADR-001 acceptance log), which disables Next.js middleware. There is no server-side gate on the web layer; the page renders even for anonymous visitors but does nothing useful (no cached secrets, no admin data) without API credentials.
- **API (`apps/api`, all `/admin/*` paths)** — the **only** auth boundary. Every admin handler calls `requireAdmin(event)` first; on miss returns `401 WWW-Authenticate: Basic realm="admin"`. The browser, on receiving 401 from a `fetch`, prompts the user once and replays the request with the `Authorization: Basic …` header. This standard browser flow fully replaces Next.js middleware for our case.
- **Secret value** — generated with `openssl rand -base64 32` (43 chars, URL-safe), stored only in:
  - 1Password vault as the source of truth
  - Lambda env var (set via Terraform from a `TF_VAR_admin_pass` env var that lives outside repo)
  - **NOT in the frontend env**, because the frontend doesn't validate; it only forwards browser-prompted credentials.

## Consequences

### Positive

- Deployable in W3 in under an hour of work.
- One-line bypass change: set `ADMIN_PASS=` to disable in dev.
- Passes through any debugger / curl tool — easy to script integration tests.

### Negative / risks

- **Password leak**: a single accidental `console.log(req.headers)` ships the password to CloudWatch. Mitigation: lint rule banning `console.log(*headers*)` + manual code review of admin paths.
- **No session expiry**: if the laptop is stolen with a logged-in admin tab, the next `/admin` request still works until the password is rotated. Mitigation: rotate every 90 days; document in runbook.
- **No audit trail of who logged in**: we are single-user, so this is moot today. When opening up, Option B becomes the migration target.

### Mitigations

- TLS terminates at CloudFront/API GW — HTTP basic header never travels in cleartext on the wire.
- Admin paths (`/admin/*`) sit behind a separate API Gateway route key from the public ones, and a Lambda-side check is the second line of defense even if the route is briefly misconfigured.
- Add a `BAN_BASIC_HEADER_LOGGING` ESLint custom rule before W3 lands the admin code.

## When this decision is revisited

1. Tomek wants to give someone else access (e.g. partner, friend who logs activities together) → migrate to Option B.
2. A leak is suspected → rotate password, then evaluate B/C.
3. We add admin features that have non-trivial server-side state (session-bound previews, undo stacks) → Option B's session model becomes a fit.

## References

- ADR-001 — `### Dlaczego nie Option C` already touches "Auth strategy for admin panel" as a follow-up.
- W3 sprint plan in ADR-001 references this ADR as a prerequisite.
