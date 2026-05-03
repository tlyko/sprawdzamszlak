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
export const RouteTypeSchema = z.enum(['off-piste', 'official']);
export type RouteType = z.infer<typeof RouteTypeSchema>;

export const RouteSchema = z.object({
  id: PeakIdSchema, // same slug rules
  name: z.string().min(1).max(200),
  type: RouteTypeSchema,
  filename: FilenameSchema,
});

export type Route = z.infer<typeof RouteSchema>;

// Public-facing route includes the presigned S3 URL the API generates per request.
export const RouteWithUrlSchema = RouteSchema.extend({
  geojson_url: z.string().url(),
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
