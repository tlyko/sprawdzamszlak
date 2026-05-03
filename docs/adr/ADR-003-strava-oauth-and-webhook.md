# ADR-003: Strava OAuth + webhook integration

**Date:** 2026-05-03
**Status:** Accepted
**Decision-maker:** Tomek (właściciel)
**Author:** architect

## Context

Per ADR-001, the deadline for "activity finished → webhook → mapa shows the route" is **2026-06-15** (Strava season). W4 of the sprint plan implements the OAuth dance and webhook subscription; W5 implements the event handler end-to-end.

Strava-side facts that constrain the design:

- **OAuth 2.0** with refresh tokens. Access tokens expire in 6 hours; refresh tokens are long-lived but rotate on each refresh and can be revoked from Strava UI.
- **Webhook delivery**: HTTP POST, JSON body with `object_type`, `object_id`, `aspect_type`, `owner_id`, `subscription_id`, `event_time`. **No HMAC signature** — the only secret in the protocol is `verify_token` exchanged during subscription handshake.
- **Webhook handshake**: Strava sends `GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`; we must echo `challenge` back as JSON within ~5s.
- **Webhook timeout**: ~2 seconds. If we don't return 200 in time, Strava marks delivery as failed and **retries with exponential backoff up to 24h**. Duplicate deliveries are normal.
- **Subscription is per-app**, not per-user. We register one subscription that receives events for every athlete who authorized the app.
- **Activity payload is not in the webhook**. The webhook only tells us "activity 12345 was created/updated". To get GPS streams we call `GET /activities/{id}/streams?keys=latlng,altitude,time` with the user's access token.

User-side facts:

- **Single user (Tomek)** for now — webhook handler can store everything keyed on a single Strava `athlete_id`.
- **Activities of interest are strictly mountain hiking, trekking, and climbing.** The owner also logs unrelated workouts in Strava (gym sessions, road running, road cycling) — those must be silently dropped. Filtering uses an **allow-list** of `sport_type` values (see D3a below), not a deny-list, so any future Strava sport type doesn't accidentally start showing on the map.
- Tomek wants the activity on the map "natychmiast po przejściu szlaku" → real-time on event, not a daily polling job.

## Decision drivers

1. **2-second budget for webhook 200 OK** (Strava timeout).
2. **Idempotency** — Strava retries on any 5xx and on slow responses; the same event will land 1-N times.
3. **Token storage** — refresh tokens are sensitive (full read access to private activities); leak = full activity history theft.
4. **Keep the failure mode simple** — if a single activity fails to import, retry must be possible without flushing the whole subscription.
5. **No new managed services** if avoidable.

## Decisions

### D1 — Token storage: Parameter Store SecureString (not DDB+KMS)

AWS Systems Manager Parameter Store with type `SecureString` for the Strava access + refresh token tuple. KMS encryption is managed by AWS (uses the `aws/ssm` CMK by default). Lambda IAM policy is scoped to `arn:aws:ssm:eu-west-1:214598715232:parameter/sprawdzamszlak/strava/*`.

**Rationale:** for one user with one set of tokens, a DDB row + custom KMS key adds boilerplate and a second IAM permission set. Parameter Store gives us encryption-at-rest, encryption-in-transit, IAM-scoped access, audit log via CloudTrail, and the zod-typed value (`StravaTokensSchema`) round-trips through `JSON.stringify` cleanly. The 0.5 day saved on KMS plumbing returns to the W4-W5 buffer.

When the project opens to multiple users, migrate to a DDB table `strava_tokens` keyed on `athlete_id`, KMS-encrypted at the table level. That's a future ADR.

### D2 — Webhook handler: async hand-off (NOT inline fetch)

The webhook handler does **only**:

1. Validate `verify_token` (subscription handshake) or signature-equivalent check on POST.
2. Run an idempotent DDB conditional `PutItem` keyed on `event_id = "{subscription_id}#{object_id}#{event_time}"` — duplicates from Strava retry are dropped.
3. Return `200` with empty body.

Total budget on the hot path: cold start (~150ms) + 1 DDB write (~10ms) + 1 round-trip = **~200ms p95**. Fits comfortably under 2s even on cold start.

Asynchronous side processes the activity:

- **Trigger**: DDB Streams on the events table → second Lambda function (`apps/api/src/strava-fetcher.ts`).
- **Steps inside the fetcher** (no time pressure here, can run for up to Lambda's 10s timeout or the function-specific override):
  - Read tokens from Parameter Store.
  - Refresh access token if expired (timestamp comparison locally; refresh API call only when needed).
  - `GET /activities/{id}` for metadata (name, sport_type, start_date, distance, elevation_gain).
  - `GET /activities/{id}/streams?keys=latlng,altitude,time,distance` for the GPS track.
  - **Filter (allow-list, see D3a)**: drop if `sport_type` not in `STRAVA_ACCEPTED_SPORT_TYPES`.
  - Convert latlng stream → GeoJSON LineString.
  - PUT GeoJSON to S3 (`trails/strava-{activity_id}.geojson`).
  - PUT row to `sprawdzamszlak-routes` table (`id = strava-{activity_id}`, `name`, `type = "off-piste"` or based on heuristics, `filename`).
  - On failure: log error with `activity_id`, leave the event in the DDB events table for manual replay (TTL: 7 days).

**Rationale:** the inline option (~1.5-2s p95 with cold start) is too close to Strava's 2s timeout. Even one slow Strava API call pushes us over and triggers a retry storm. DDB Streams + a second Lambda gives near-zero hot-path latency, native retry semantics on the stream side, and trivial replayability (just reinsert the event).

### D3a — `sport_type` allow-list

```ts
// packages/shared/src/index.ts
export const STRAVA_ACCEPTED_SPORT_TYPES = [
  // Mountain hiking / trekking
  'Hike',
  'Walk',           // sometimes mountain walks are logged as Walk, especially short ones
  // Climbing
  'RockClimbing',
  // Backcountry skiing — counts as a mountain trip
  'BackcountrySki',
  'AlpineSki',
] as const;

export type StravaAcceptedSportType = (typeof STRAVA_ACCEPTED_SPORT_TYPES)[number];
```

Anything else (`Run`, `TrailRun`, `Ride`, `VirtualRide`, `WeightTraining`, etc.) is dropped silently — `event_id` is still recorded in the events table for idempotency, but the fetcher exits before calling the Strava API for the streams. Logged with the dropped `sport_type` so we can audit the filter via CloudWatch.

The allow-list is intentionally narrow. To extend it (e.g. add `MountainBikeRide` if the owner ever logs MTB descents on the same trails) — edit this list, redeploy, no schema migration needed.

### D3 — Idempotency key

`event_id = "{subscription_id}#{object_id}#{event_time}"`. Stored as `pk` in a new DDB table `sprawdzamszlak-strava-events` with `event_time` as `sk` for time-range queries during debugging. TTL attribute `expires_at = event_time + 7 days` so the events table doesn't grow forever.

Conditional `PutItem` with `attribute_not_exists(pk)` makes duplicate webhook deliveries no-ops. The Streams trigger fires only on successful first writes, so the fetcher runs at most once per logical event.

### D4 — Webhook subscription lifecycle

- **Creation**: one-shot, manual via `corepack pnpm -F api strava:subscribe` script (added in W4) that POSTs to `https://www.strava.com/api/v3/push_subscriptions` with `client_id`, `client_secret`, our public callback URL, and a freshly generated `verify_token` stored in Parameter Store.
- **Verification**: Strava immediately calls our `GET /strava/webhook` endpoint; we read `verify_token` from Parameter Store and respond.
- **Subscription id**: stored in Parameter Store after creation.
- **Deletion**: `corepack pnpm -F api strava:unsubscribe` for emergencies.

We do not manage subscription via Terraform — it's a one-time manual act per environment, and rotating the `verify_token` requires re-creating anyway.

### D5 — OAuth flow location

The OAuth flow lives in `apps/web/admin/strava` (Next.js, basic-auth gated per ADR-002), not in `apps/api`. Rationale:

- Tomek goes through OAuth once. No need for a stateless callback handler.
- Cookie-based session affinity from the admin panel makes the redirect_uri verification simpler.
- Lambda would need to add HTML responses for the consent flow — out of scope for an API.

The `apps/web` route server-side calls `apps/api/strava/oauth/exchange` (admin-auth) which writes tokens into Parameter Store. Web never sees the tokens.

## Consequences

### Positive

- Webhook handler is < 30 lines. Latency budget never under pressure.
- Tokens never travel through web app code; web triggers the exchange but Lambda owns persistence.
- Replay of failed events is trivial (`aws dynamodb put-item`).

### Negative / risks

- **Two Lambdas** instead of one. Slight cold-start cost on the fetcher path, but it's not on the hot path.
- **DDB Streams is async**: from event arrival to GeoJSON in S3 typical latency is 1-5s, occasionally up to a minute on cold start of the fetcher. Acceptable for "trasa pojawia się na mapie zaraz po wpięciu" (Tomek refreshes browser when he gets home).
- **No HMAC** on the POST payload. Anyone who learns our webhook URL and knows the JSON shape can spam us with fake events. Mitigations:
  - Subscription URL is on `*.execute-api.eu-west-1.amazonaws.com` (not guessable, not indexed).
  - Idempotency check rejects duplicates and impossible event ids.
  - Throttling on the route (5 rps, burst 10) limits damage.
  - Fetcher only acts on Strava-API-confirmed activities (it calls `GET /activities/{id}` with our token; a fake event with a non-existent id 404s and gets dropped).

### Mitigations

- Add `WAF` rate-based rule at API Gateway level for the webhook path (5 rps per IP is plenty — Strava itself is well below that).
- Log every dropped/duplicate event with `event_id` so we can spot abuse patterns.

## When this decision is revisited

- A second user joins → tokens move to a DDB table keyed on `athlete_id`; ADR-008 or similar.
- Strava removes the 2s webhook timeout (unlikely) or starts signing payloads (also unlikely) → re-evaluate D2.
- We start importing 100s of activities a day → consider SQS in front of the fetcher for backpressure (overkill today).

## References

- Strava webhook docs: <https://developers.strava.com/docs/webhooks/>
- Strava activities API: <https://developers.strava.com/docs/reference/#api-Activities-getActivityById>
- ADR-001 W4-W5 sprint plan
- ADR-002 (admin auth) — strava OAuth route is admin-gated
