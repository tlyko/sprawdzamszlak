# ADR-007: Strava OAuth start page — location and CSRF model

**Date:** 2026-05-03
**Status:** Accepted
**Decision-maker:** Tomek (właściciel)
**Author:** architect

## Context

ADR-003 D5 placed the Strava OAuth flow under `apps/web/admin/strava`, gated by basic auth per ADR-002. Both premises are gone:

- ADR-002 is superseded — PR #21 (W3 admin panel) was closed; there is no admin route in `apps/web` anymore.
- `apps/web` is a fully static Next.js export (`output: 'export'`) deployed on Cloudflare Workers + Static Assets (per ADR-001 acceptance log). There is no Next.js middleware to gate anything server-side, and no server-side OAuth callback handler is possible on the web side.

Owner needs to authorize the Strava app exactly once. The flow is:

1. Owner clicks "Połącz ze Stravą".
2. Browser ends up at `https://www.strava.com/oauth/authorize?...`.
3. Strava authenticates the owner against his Strava account (this is the real auth boundary — not us).
4. Strava redirects back to our `redirect_uri` with `?code=...&state=...`.
5. Our backend exchanges `code` for an access + refresh token tuple and stores it in Parameter Store.

Because the only mutating endpoint is `/strava/oauth/callback` (must accept `?code=...` from Strava's redirect), CSRF protection requires a `state` parameter that ties an in-flight authorization to an issuer we trust. With a static frontend, `state` cannot be issued or validated client-side — it must round-trip through the API.

## Decision drivers

1. **Single-user single-shot flow.** Optimize for clarity, not a high-volume sign-up funnel.
2. **Static frontend** can render a button but cannot mint or validate `state`.
3. **CSRF protection** is non-negotiable — without it, an attacker who learns the callback URL and `client_id` can trick the owner's browser into binding the attacker's Strava account to our token store.
4. **Token never touches the web layer.** ADR-003 already commits to this; the callback must be an API endpoint.

## Decision

### D1 — Two static pages on `apps/web`, both public

- `apps/web/app/strava/page.tsx` — explainer + a single `<a href="https://{api-host}/strava/oauth/start">` button. No logic, no auth, no JS state. Renders the same for any visitor.
- `apps/web/app/strava/connected/page.tsx` — confirmation page (`/strava/connected`). Reads `?status=ok|error&reason=...` from the query string for a friendly message. Again, no auth, no logic that touches tokens.

Public exposure is fine: neither page reveals anything sensitive. The "connect" button initiates a flow that only succeeds for the Strava account whose `client_id` matches our app, and the token storage is gated by Parameter Store IAM (Lambda-only).

### D2 — `state` is minted and validated by `apps/api`

Two new Lambda routes:

- `GET /strava/oauth/start` — generates a 32-byte URL-safe random `state`, writes it to a DDB table `sprawdzamszlak-strava-oauth-states` with `pk = state`, `expires_at = now + 600s` (10 min TTL), then `302` redirects to `https://www.strava.com/oauth/authorize?client_id=...&redirect_uri={api}/strava/oauth/callback&response_type=code&scope=read,activity:read_all&approval_prompt=auto&state={state}`.
- `GET /strava/oauth/callback` — reads `?code` and `?state`. Conditional `DeleteItem` on the states table for `state` (returns the deleted item on success); if the state was missing or already consumed, returns `400` and redirects browser to `/strava/connected?status=error&reason=invalid_state`. On success, exchanges `code` for tokens via Strava's `/oauth/token` endpoint, writes the tuple to Parameter Store as a `SecureString`, and redirects browser to `/strava/connected?status=ok`.

The states table is intentionally separate from `sprawdzamszlak-strava-events` — different schema, different TTL, different access pattern. Single-table design here would be premature.

### D3 — No HTTPS-Only cookie session

The flow is stateless on the user side: the only state is the short-lived `state` nonce, and it lives in DDB on the server. No cookie is set. After `/strava/oauth/callback` returns, the browser has no credential — and shouldn't, because the owner is not "logged in" to anything. He authorized our backend to read his Strava activities; further interactions happen Strava→webhook→Lambda, with no user in the loop.

## Consequences

### Positive

- Static-export-friendly: works on Cloudflare Workers + Static Assets without an edge function.
- Token never reaches the browser — same property ADR-003 D5 promised.
- CSRF is a single conditional DDB write/delete — no session store, no cookie, no JWT.
- Owner can re-authorize at any time by visiting `/strava` again (e.g., after Strava revokes the token); the flow is idempotent because `PutItem` to Parameter Store overwrites.

### Negative / risks

- **One extra DDB table.** Trivially small (max ~1 row at a time given single-user, 10-min TTL), but it's another piece of infrastructure to declare in Terraform. Cost is rounding-error.
- **`state` table is per-app, not per-environment.** Today there's only `prod`. If we add `dev`, the table needs a `Stage` prefix on the key or a separate table.
- **Public callback URL.** Anyone who knows the URL can hit it with a guessed `state`; the conditional delete makes guessing 2^256 work and the rate-limit on the route caps damage at noise. This is the same posture as Strava's own callback model.

### Mitigations

- API Gateway throttling on `/strava/oauth/*` paths (5 rps, burst 10) — same as ADR-003's webhook rate limit.
- CloudWatch alarm on `/strava/oauth/callback` `400` count > 10 in 5 min → email (probable abuse).
- The states-table TTL means a leaked `state` is useless after 10 minutes.

## What this changes in earlier ADRs

- **ADR-002**: superseded (already updated 2026-05-03). The "admin auth" question is dormant until a non-Strava admin surface re-appears.
- **ADR-003 D5**: the Strava OAuth flow does **not** live in `apps/web/admin/strava`. It lives in `apps/web/app/strava` (static, public) plus `apps/api`'s two new routes (`/strava/oauth/start` and `/strava/oauth/callback`). D5's other commitments (token never travels through web, web doesn't see tokens) are preserved and strengthened — web no longer participates in the exchange at all.

## When this decision is revisited

- A second user joins → `state` table needs a per-user partition key, or move OAuth start behind real user auth so the state already binds to a session.
- Strava adds PKCE → adopt it; PKCE replaces server-side `state` validation with a code verifier hashed on the start side and revealed on the callback side. Same DDB table, different field.
- A browser admin panel returns post-season (see ADR-002 superseded note) → re-evaluate whether OAuth start should sit behind admin auth. For single-user, the answer is "no, it doesn't need to" — the gate is Strava itself.

## References

- ADR-001 — sprint plan (W4 deadline 2026-06-15).
- ADR-002 — superseded; admin panel retracted.
- ADR-003 — webhook handler, token storage, sport_type allow-list. D5 narrowed by this ADR.
- Strava OAuth docs: <https://developers.strava.com/docs/authentication/>
