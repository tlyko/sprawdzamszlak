// Shared zod schemas used by apps/api (Lambda) and apps/web (Next.js).
//
// These are the canonical types for the domain. Both backend and frontend
// parse against the same schema; mismatches surface at runtime.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Filename allowlist (security issue H3 from security sweep 2026-05-01)
// ---------------------------------------------------------------------------
//
// GeoJSON filenames in S3 must match this pattern. Used both when writing
// (admin upload endpoint, W3) and when reading (presigned URL generation).
// IAM scopes S3 access to `bucket/trails/*`, so traversal is blocked at the
// service layer; this regex is defense-in-depth at the application layer.
export const SAFE_FILENAME = /^[a-z0-9_]{1,64}\.geojson$/;

export const FilenameSchema = z
  .string()
  .regex(SAFE_FILENAME, 'Filename must match /^[a-z0-9_]{1,64}\\.geojson$/');

// ---------------------------------------------------------------------------
// Peak — a Tatra summit tracked on the map
// ---------------------------------------------------------------------------
//
// Historical data was stored in DDB with string-encoded numbers (latitude,
// longitude, height). The schema coerces both shapes for backward
// compatibility; new writes from `apps/api` and `apps/web/admin` should
// always send numbers.
const NumericString = z.union([z.number(), z.string()]).transform((v) => {
  if (typeof v === 'number') return v;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`expected numeric, got ${JSON.stringify(v)}`);
  }
  return n;
});

export const PeakIdSchema = z
  .string()
  .regex(/^[a-z0-9_-]{1,64}$/, "Peak id must match /^[a-z0-9_-]{1,64}$/");

export const PeakSchema = z.object({
  id: PeakIdSchema,
  nazwa: z.string().min(1).max(120),
  trudnosc: z.string().min(1).max(120),
  trudnosc_wspinaczkowa: z.string().max(40).optional(),
  latitude: NumericString,
  longitude: NumericString,
  height: NumericString.optional(),
  description_html: z.string().max(2000).optional(),
  wiki_url: z.string().url().optional(),
});

export type Peak = z.infer<typeof PeakSchema>;

// ---------------------------------------------------------------------------
// Route — a hiking/off-piste track stored as GeoJSON in S3, metadata in DDB
// ---------------------------------------------------------------------------
// Route categories drive trail style on the map. Five values:
//   - official     — marked PTTK/TANAP trail (manual seed only)
//   - off-piste    — Tatra unmarked walking/scrambling (default, manual seed)
//   - walk         — Strava `Walk` (lowland/forest, distinct from off-piste)
//   - ski-tour     — Strava `BackcountrySki` / `AlpineSki`
//   - climbing     — Strava `RockClimbing`
export const RouteTypeSchema = z.enum([
  'official',
  'off-piste',
  'walk',
  'ski-tour',
  'climbing',
]);
export type RouteType = z.infer<typeof RouteTypeSchema>;

// Strava sport_type → our route type. Values outside SPORT_TYPE_ALLOWLIST
// don't reach this function (fetcher drops them). Hike maps to off-piste
// because owner records mountain hikes as Hike on Strava — the same trip
// in seed data would already be "off-piste".
export function sportTypeToRouteType(sportType: StravaSportType): RouteType {
  switch (sportType) {
    case 'Hike':
      return 'off-piste';
    case 'Walk':
      return 'walk';
    case 'RockClimbing':
      return 'climbing';
    case 'BackcountrySki':
    case 'AlpineSki':
      return 'ski-tour';
  }
}

// Strava photos re-hosted in S3. Stored on the DDB row as object keys
// (relative to the bucket prefix `trails/`) so the API can presign them per
// request; same pattern as the GeoJSON URL. Caption is optional — Strava
// returns it on the photos endpoint but most photos don't have one.
//
// Key shape: `photos/<activity_id>/<index>.jpg`. The leading `trails/` is
// implicit (matches IAM scope on the bucket); index is 0-based per activity.
export const SAFE_PHOTO_KEY = /^photos\/[0-9]{1,20}\/[0-9]{1,3}\.jpg$/;
export const PhotoKeySchema = z
  .string()
  .regex(SAFE_PHOTO_KEY, 'Photo key must match /^photos\\/[0-9]+\\/[0-9]+\\.jpg$/');

export const RoutePhotoSchema = z.object({
  key: PhotoKeySchema,
  caption: z.string().max(500).optional(),
});
export type RoutePhoto = z.infer<typeof RoutePhotoSchema>;

export const RouteSchema = z.object({
  id: PeakIdSchema, // same slug rules
  name: z.string().min(1).max(200),
  type: RouteTypeSchema,
  filename: FilenameSchema,
  // Capped at 20 to bound API enrichment cost (one presign per photo).
  // Strava's per-activity limit is much lower in practice (a handful).
  photos: z.array(RoutePhotoSchema).max(20).optional(),
});

export type Route = z.infer<typeof RouteSchema>;

// Public-facing route includes the presigned S3 URL the API generates per
// request. Photo keys are similarly turned into presigned URLs at enrichment
// time — the frontend never sees raw S3 object keys.
export const RoutePhotoWithUrlSchema = z.object({
  url: z.string().url(),
  caption: z.string().max(500).optional(),
});
export type RoutePhotoWithUrl = z.infer<typeof RoutePhotoWithUrlSchema>;

export const RouteWithUrlSchema = RouteSchema.omit({ photos: true }).extend({
  geojson_url: z.string().url(),
  photos: z.array(RoutePhotoWithUrlSchema).max(20).optional(),
});

export type RouteWithUrl = z.infer<typeof RouteWithUrlSchema>;

// ---------------------------------------------------------------------------
// Strava activity — created in W4. Placeholder so apps/web can import the
// type now even though only the empty schema exists.
// ---------------------------------------------------------------------------
export const StravaActivityIdSchema = z.string().regex(/^[0-9]{1,20}$/);

// Strava sport_type values that should be imported as routes.
// Owner also logs gym workouts, road running, and road cycling — those
// drop silently in the fetcher Lambda. See ADR-003 D2.
export const SPORT_TYPE_ALLOWLIST = [
  'Hike',
  'Walk',
  'RockClimbing',
  'BackcountrySki',
  'AlpineSki',
] as const;

export const StravaSportTypeSchema = z.enum(SPORT_TYPE_ALLOWLIST);
export type StravaSportType = z.infer<typeof StravaSportTypeSchema>;

// Persisted Strava token tuple (Parameter Store SecureString, JSON-encoded).
// `expires_at` is the access-token expiry as unix seconds — refresh in the
// fetcher Lambda when `now >= expires_at - 60s`.
export const StravaTokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.number().int().positive(),
  athlete_id: z.number().int().positive(),
});
export type StravaTokens = z.infer<typeof StravaTokensSchema>;

// Concrete schema is filled in W4 once Strava API shapes are pinned.
export const StravaActivitySchema = z.object({
  id: StravaActivityIdSchema,
  // …more fields in W4…
});

export type StravaActivity = z.infer<typeof StravaActivitySchema>;

// ---------------------------------------------------------------------------
// Plan — a planned trip to a Tatra peak (ADR-008).
// ---------------------------------------------------------------------------
//
// "Kronika != log" — plans capture intent ahead of time and become part of
// the chronicle once status flips to 'done' (with optional strava_id link
// to the actual route).
//
// Shared between apps/api (DDB persistence + CRUD) and apps/web (UI render
// + form payload). The wire shape on POST/PATCH uses the *Input schemas
// (no id/timestamps); persisted shape uses the full PlanSchema.

export const PlanIdSchema = z
  .string()
  .uuid('plan id must be a uuid v4');

export const PlanStatusSchema = z.enum(['planned', 'done', 'skipped']);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

// Plans link to a route via "strava-<id>" or any future native route id.
// Same allowlist as Route.id (PeakIdSchema reused).
export const PlanStravaLinkSchema = z
  .string()
  .regex(/^[a-z0-9_-]{1,64}$/, 'plan strava_id must match route id pattern');

const TARGET_YEAR_MIN = 2020;
const TARGET_YEAR_MAX = 2050;

export const PlanSchema = z.object({
  id: PlanIdSchema,
  peak_slug: PeakIdSchema,
  target_year: z
    .number()
    .int()
    .min(TARGET_YEAR_MIN)
    .max(TARGET_YEAR_MAX),
  target_month: z.number().int().min(1).max(12).optional(),
  status: PlanStatusSchema,
  route_idea: z.string().max(500).optional(),
  notes: z.string().max(4000).optional(),
  strava_id: PlanStravaLinkSchema.optional(),
  created_at: z.number().int().positive(),
  updated_at: z.number().int().positive(),
});
export type Plan = z.infer<typeof PlanSchema>;

// POST /admin/plans payload — server fills id/created_at/updated_at and
// defaults status to 'planned'.
export const PlanCreateInputSchema = z.object({
  peak_slug: PeakIdSchema,
  target_year: z
    .number()
    .int()
    .min(TARGET_YEAR_MIN)
    .max(TARGET_YEAR_MAX),
  target_month: z.number().int().min(1).max(12).optional(),
  status: PlanStatusSchema.optional(),
  route_idea: z.string().max(500).optional(),
  notes: z.string().max(4000).optional(),
  strava_id: PlanStravaLinkSchema.optional(),
});
export type PlanCreateInput = z.infer<typeof PlanCreateInputSchema>;

// PATCH /admin/plans/{id} payload — every field optional, but at least
// one must be present (zod refinement). Server stamps updated_at.
export const PlanUpdateInputSchema = PlanCreateInputSchema.partial().refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'at least one field must be provided' },
);
export type PlanUpdateInput = z.infer<typeof PlanUpdateInputSchema>;
