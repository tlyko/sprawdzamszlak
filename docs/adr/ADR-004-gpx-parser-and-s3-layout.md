# ADR-004: GPX parser and S3 layout for uploaded tracks

**Date:** 2026-05-03
**Status:** Accepted
**Decision-maker:** Tomek (właściciel)
**Author:** architect

## Context

ADR-001 W3 introduces an admin endpoint `POST /api/admin/upload` that accepts a GPX file from the admin panel, converts it to GeoJSON, stores the result in S3, and writes a metadata row to the `sprawdzamszlak-routes` table.

Today GPX → GeoJSON is done manually in the browser via geojson.io. Tomek explicitly wants this endpoint so he can drop a `.gpx` from his watch into the panel without leaving the app. ADR-003's Strava webhook fetches GPS streams directly (skipping GPX entirely), so this endpoint is the manual / non-Strava path.

Constraints:

- GPX comes from Garmin watches, COROS, Suunto, sometimes from third-party apps (Locus, OruxMaps). Format compliance varies (some emit `<extensions>` blocks, some emit `<trkseg>` chunks separated by pauses, some have heart-rate noise).
- Files are typically 50-500 KB; outliers up to 5 MB for multi-day tours.
- Single upload at a time — Tomek isn't running batch imports.
- Lambda payload limit (API GW HTTP API): **6 MB hard cap on request body**.

## Decision drivers

1. **Reliability** > performance — bad GPX should fail loudly, not silently produce a half-track.
2. **Single source of truth** for the slug/filename rules. Same regex (`SAFE_FILENAME` from `packages/shared`) used for upload, presigned URL, security issue H3.
3. **No new infra**. Reuse existing S3 bucket and DDB routes table.
4. **Bundle size** — esbuild bundle for Lambda must stay reasonable.

## Decisions

### D1 — GPX parser: `@tmcw/togeojson`

Direct conversion from GPX XML → GeoJSON FeatureCollection. Battle-tested (used by Mapbox docs site, OSM tooling), small (~10 KB minified), zero runtime deps.

Alternatives considered:

- **`gpx-parser-builder`** — also small, but more focused on round-tripping (parse + serialize). We only need parse.
- **Roll our own with `fast-xml-parser`** — defeats the point; togeojson handles the format quirks (`<trkseg>` splits, `<extensions>` ignore, trk vs rte vs wpt) we'd otherwise re-discover.
- **`gpx2geojson`** — last published 2018, archived.

`@tmcw/togeojson` requires a DOMParser. Lambda nodejs22.x has no DOM by default; we use the `@xmldom/xmldom` shim (~30 KB minified) — total parser footprint ~40 KB.

### D2 — Endpoint shape

```
POST /api/admin/upload
Authorization: Basic ...                   ← from ADR-002
Content-Type: multipart/form-data

Fields:
  gpx          file       required  ≤ 5 MB
  id           string     required  matches SAFE_FILENAME slug rules without .geojson
  name         string     required  ≤ 200 chars
  type         enum       required  "off-piste" | "official"
```

Response:

```json
{
  "id": "rysy_2026_05_15",
  "filename": "rysy_2026_05_15.geojson",
  "feature_count": 1,
  "point_count": 4523
}
```

Errors:

- `400` — bad multipart, missing field, slug regex fail, GPX parse error, more than 1 LineString result, payload over 5 MB.
- `409` — slug already exists in DDB.
- `500` — opaque request id, see ADR-001 H1.

### D3 — Slug and filename derivation

Slug rules (shared with H3): `/^[a-z0-9_]{1,64}$/`. Filename = `{slug}.geojson`. Forced lowercase before validation (`rysy_2026_05_15` not `Rysy_2026_05_15`).

Strava-imported routes use slug `strava-{activity_id}` (per ADR-003) — distinct namespace from manually uploaded. The `-` is not in `SAFE_FILENAME` regex by intent: prevents Tomek from accidentally creating `strava-fake-id` slugs that would collide with the Strava namespace. Strava-side bypasses the regex by prepending `strava-` after validation.

### D4 — S3 layout

```
sprawdzamszlak-trails-storage-214598715232/
├── trails/                    ← single flat namespace, slug.geojson
│   ├── rysy_2026_05_15.geojson
│   ├── strava-12345678.geojson
│   └── …
└── (no other prefixes today)
```

No nested prefixes by year/month. With <100 files projected over the next year, flat is simpler and presigned URL paths stay short.

### D5 — Conversion rules

- **Multiple `<trk>` blocks** in one GPX: merge into one LineString. We do not preserve track-level metadata (Tomek's hike often has Garmin auto-pause segments and we want one continuous line).
- **Elevation**: include in `coordinates` as third element when present (lon, lat, ele). Frontend ignores it today; future altitude profile uses it.
- **Time, heart rate, cadence, etc.**: discard. Not on the map; bloat the file 2-3×.
- **`<wpt>` waypoints**: discard. We track tracks, not POIs (peaks come from the seed).
- **Empty result** (no points): 400 error.
- **Self-intersecting tracks**: kept as-is. Some legitimate tracks loop back (summit + return).

### D6 — Idempotency

Upload creates a new resource. Re-uploading the same `id` returns `409 Conflict` — caller must delete first via a separate `DELETE /api/admin/route/{id}` (W3 follow-up). Rationale: protects against accidental overwrite of a manually edited GeoJSON. Strava imports are idempotent on `strava-{activity_id}` (per ADR-003).

### D7 — Validation order

1. `requireAdmin(event)` — ADR-002 basic auth.
2. Parse multipart (use `lambda-multipart-parser` ~5 KB or hand-roll; lean toward hand-roll for ~20 lines).
3. Body size check (≤ 5 MB).
4. Slug regex check (`SAFE_FILENAME` minus `.geojson` extension).
5. Conditional DDB `PutItem` with `attribute_not_exists(id)` — if conflict, abort before doing the parse.
6. Parse GPX → GeoJSON.
7. Sanity check: at least 1 LineString, at least 2 points.
8. PUT to S3 (`Bucket=…, Key=trails/{slug}.geojson, Body=…, ContentType=application/geo+json`).
9. Return 200 with feature_count and point_count.

If step 8 fails after step 5 succeeded: best-effort `DeleteItem` on DDB to roll back, then 500. We can live with the rare half-state and document it in the runbook.

## Consequences

### Positive

- One regex (`SAFE_FILENAME`) is the source of truth across upload, Strava import, presigned URL, frontend.
- 5 MB cap covers 99.99% of GPX files we'll see.
- Bundle size still under 100 KB for the API zip.

### Negative / risks

- **`@xmldom/xmldom`** has had memory-handling CVEs in the past. Mitigation: pin to `^0.9` (current major), monitor `npm audit`, fail fast on file size.
- **Hand-rolled multipart parser** is ~20 LOC of risk. Mitigation: simple test suite (3-4 fixtures + edge cases) and a 5 MB ceiling enforced before parsing.
- **Strava namespace collision**: solved structurally (the `-` in `strava-` is not in the regex), but the rule must stay enforced; lint check or unit test.

### Mitigations

- Add a small `apps/api/test/upload.test.ts` with: (a) valid Garmin GPX, (b) malformed XML, (c) empty result, (d) slug collision, (e) over-size body, (f) hand-coded `strava-12345` slug rejection.

## When this decision is revisited

- We start uploading 50+ tracks at once → batch endpoint or background processing.
- Tomek wants altitude profile / time stats on the frontend → preserve elevation/time in GeoJSON properties.
- More watch vendors emit non-standard `<extensions>` we want to keep → revisit conversion rules.

## References

- ADR-001 W3 sprint plan.
- ADR-002 — auth gating for `/api/admin/*`.
- ADR-003 — Strava namespace shares the same S3 prefix.
- `@tmcw/togeojson`: <https://github.com/placemark/togeojson>
- Security sweep H3 — filename allowlist regex.
