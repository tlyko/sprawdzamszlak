/*
 * Shared map types.
 *
 * Mirrors the API responses (`GET /` for peaks, `GET /routes` for trails) and
 * the per-trail GeoJSON fetched from S3 presigned URLs. Kept here so every map
 * sub-component imports from one place; if/when `packages/shared` lands per
 * the monorepo plan in CLAUDE.md, these move there.
 *
 * Notes:
 *  - `Trail.type` is the only attribute the manifest currently exposes.
 *    Slice C of the Strava work persists `properties.sport_type` inside the
 *    GeoJSON Feature, but that's per-feature, not per-manifest-row, and styling
 *    in PR 2 is intentionally driven only by `type`. Once a future manifest
 *    surfaces `activity_type`, extend `getTrailStyle` accordingly.
 *  - `TrailGeoJson` is loose on purpose — Leaflet's GeoJSON layer accepts any
 *    valid GeoJSON object and tightening it would mean shipping geojson types
 *    that we don't otherwise use.
 */
export interface Peak {
  id: string;
  nazwa: string;
  trudnosc: string;
  latitude?: number;
  longitude?: number;
  height?: number;
}

// Mirrors RouteTypeSchema in @sprawdzamszlak/shared. Five values:
//   official  — PTTK/TANAP marked trail (manual seed only)
//   off-piste — Tatra unmarked walking/scrambling
//   walk      — Strava `Walk` (lowland/forest)
//   ski-tour  — Strava `BackcountrySki` / `AlpineSki`
//   climbing  — Strava `RockClimbing`
export type TrailType =
  | "official"
  | "off-piste"
  | "walk"
  | "ski-tour"
  | "climbing";

export interface Trail {
  id: string;
  name: string;
  type: TrailType;
  geojson_url: string;
}

// Generic GeoJSON payload as returned by the trail S3 URLs. The Strava
// fetcher (apps/api/src/strava/fetcher.ts) emits a single Feature per route;
// older manual seeds may emit a FeatureCollection. Loose on purpose so
// Leaflet's GeoJSON layer handles both shapes; the trip-detail panel narrows
// via `extract-trip-meta.ts`.
export type TrailGeoJson = unknown;

/**
 * Shape of `properties` on a route Feature, as written by the slice-C Strava
 * fetcher. Every field is optional — manual seeds don't carry any of these,
 * and older Strava imports may pre-date individual fields. Distance and
 * elevation are in metres; start_date is an ISO 8601 string.
 */
export interface TripFeatureProperties {
  name?: string;
  sport_type?: string;
  start_date?: string;
  distance?: number;
  total_elevation_gain?: number;
  description?: string;
  source?: "strava" | "manual";
  strava_activity_id?: number;
}

/**
 * Coordinate tuple as it appears on the LineString geometry. Altitude is the
 * optional third element — present when Strava streams returned an `altitude`
 * series, missing for manual seeds and older imports.
 */
export type TripCoordinate = [number, number] | [number, number, number];
