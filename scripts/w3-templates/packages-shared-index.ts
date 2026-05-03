// Shared zod schemas — used by apps/api (Lambda) and apps/web (Next.js).

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Filename allowlist (security issue H3 from security sweep 2026-05-01)
// ---------------------------------------------------------------------------
//
// GeoJSON filenames in S3 must match this pattern. Used both when writing
// (admin upload, W3 / Strava import, W4) and when reading (presigned URL).
// IAM scopes S3 access to `bucket/trails/*`, so traversal is blocked at the
// service layer; this regex is defense-in-depth at the application layer.
export const SAFE_FILENAME = /^[a-z0-9_]{1,64}\.geojson$/;
export const FilenameSchema = z
  .string()
  .regex(SAFE_FILENAME, 'Filename must match /^[a-z0-9_]{1,64}\\.geojson$/');

// ---------------------------------------------------------------------------
// Slug rules — same shape as filename without extension; shared with peaks
// ---------------------------------------------------------------------------
export const SLUG_REGEX = /^[a-z0-9_]{1,64}$/;
export const SlugSchema = z
  .string()
  .regex(SLUG_REGEX, 'Slug must match /^[a-z0-9_]{1,64}$/');

// Prefix reserved for Strava-imported routes (per ADR-003). Manual uploads
// must NOT collide with this namespace; the slug regex (no `-`) prevents it
// structurally, but we still check explicitly in the upload validator.
export const STRAVA_PREFIX = 'strava-';

// ---------------------------------------------------------------------------
// Numeric coercion (handles legacy DDB rows with string-encoded numbers)
// ---------------------------------------------------------------------------
const NumericString = z.union([z.number(), z.string()]).transform((v) => {
  if (typeof v === 'number') return v;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`expected numeric, got ${JSON.stringify(v)}`);
  }
  return n;
});

// ---------------------------------------------------------------------------
// Peak — a Tatra summit
// ---------------------------------------------------------------------------
export const PeakSchema = z.object({
  id: SlugSchema,
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
// Route — a hiking/off-piste track
// ---------------------------------------------------------------------------
export const RouteTypeSchema = z.enum(['off-piste', 'official']);
export type RouteType = z.infer<typeof RouteTypeSchema>;

export const RouteSchema = z.object({
  id: SlugSchema,
  name: z.string().min(1).max(200),
  type: RouteTypeSchema,
  filename: FilenameSchema,
});
export type Route = z.infer<typeof RouteSchema>;

export const RouteWithUrlSchema = RouteSchema.extend({
  geojson_url: z.string().url(),
});
export type RouteWithUrl = z.infer<typeof RouteWithUrlSchema>;

// ---------------------------------------------------------------------------
// Admin GPX upload — input validation for POST /admin/upload (W3)
// ---------------------------------------------------------------------------
//
// Form-encoded multipart fields, validated AFTER multipart parsing. The GPX
// file body itself is checked separately (size cap, parse success).

export const MAX_GPX_BYTES = 5 * 1024 * 1024; // 5 MB ceiling per ADR-004

export const RouteUploadInputSchema = z
  .object({
    id: SlugSchema,
    name: z.string().min(1).max(200),
    type: RouteTypeSchema,
  })
  .refine((data) => !data.id.startsWith(STRAVA_PREFIX), {
    message: `Slug cannot start with reserved prefix "${STRAVA_PREFIX}"`,
    path: ['id'],
  });
export type RouteUploadInput = z.infer<typeof RouteUploadInputSchema>;

// ---------------------------------------------------------------------------
// Strava — placeholder; concrete schema in W4
// ---------------------------------------------------------------------------
export const StravaActivityIdSchema = z.string().regex(/^[0-9]{1,20}$/);
export const StravaActivitySchema = z.object({
  id: StravaActivityIdSchema,
});
export type StravaActivity = z.infer<typeof StravaActivitySchema>;
