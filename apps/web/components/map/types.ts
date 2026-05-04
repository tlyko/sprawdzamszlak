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

export type TrailType = "official" | "off-piste";

export interface Trail {
  id: string;
  name: string;
  type: TrailType;
  geojson_url: string;
}

// Generic GeoJSON payload as returned by the trail S3 URLs.
export type TrailGeoJson = unknown;
