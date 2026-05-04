/*
 * extract-trip-meta — narrow the loose `TrailGeoJson` (intentionally `unknown`
 * in components/map/types.ts) into the shape the trip detail panel needs.
 *
 * The S3 payload comes in two flavours:
 *  - Strava fetcher (slice C, apps/api/src/strava/fetcher.ts) writes a single
 *    Feature with a LineString geometry and rich `properties`.
 *  - Older manual seeds may write a FeatureCollection; the first Feature is
 *    the one we want.
 *
 * This helper handles both, returns null when the payload is unrecognisable,
 * and keeps the panel free of any structural casts. No `any`.
 *
 * The runtime checks here are deliberately liberal — we accept anything that
 * walks like a LineString Feature. Tightening would block on a real shared
 * GeoJSON schema (deferred to packages/shared per CLAUDE.md monorepo plan).
 */
import type {
  TrailGeoJson,
  TripCoordinate,
  TripFeatureProperties,
} from "@/components/map/types";

export interface TripMeta {
  properties: TripFeatureProperties;
  coordinates: TripCoordinate[];
}

interface RawFeature {
  type: "Feature";
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: Record<string, unknown> | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFeature(value: unknown): value is RawFeature {
  return isObject(value) && (value as { type?: unknown }).type === "Feature";
}

function pickFeature(payload: TrailGeoJson): RawFeature | null {
  if (isFeature(payload)) return payload;
  if (
    isObject(payload) &&
    (payload as { type?: unknown }).type === "FeatureCollection"
  ) {
    const features = (payload as { features?: unknown }).features;
    if (Array.isArray(features) && features.length > 0) {
      const first = features[0];
      if (isFeature(first)) return first;
    }
  }
  return null;
}

function isCoordinate(value: unknown): value is TripCoordinate {
  if (!Array.isArray(value)) return false;
  if (value.length < 2 || value.length > 3) return false;
  return value.every((n) => typeof n === "number" && Number.isFinite(n));
}

function pickCoordinates(feature: RawFeature): TripCoordinate[] {
  const geometry = feature.geometry;
  if (!geometry || geometry.type !== "LineString") return [];
  const raw = geometry.coordinates;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isCoordinate);
}

// Whitelist + cast properties into the typed shape. We never spread unknown
// payload directly — that would let through arbitrary keys at runtime even
// though TypeScript can't see them.
function pickProperties(feature: RawFeature): TripFeatureProperties {
  const raw = feature.properties;
  if (!isObject(raw)) return {};
  const out: TripFeatureProperties = {};

  if (typeof raw.name === "string") out.name = raw.name;
  if (typeof raw.sport_type === "string") out.sport_type = raw.sport_type;
  if (typeof raw.start_date === "string") out.start_date = raw.start_date;
  if (typeof raw.distance === "number" && Number.isFinite(raw.distance)) {
    out.distance = raw.distance;
  }
  if (
    typeof raw.total_elevation_gain === "number" &&
    Number.isFinite(raw.total_elevation_gain)
  ) {
    out.total_elevation_gain = raw.total_elevation_gain;
  }
  if (typeof raw.description === "string" && raw.description.trim().length > 0) {
    out.description = raw.description;
  }
  if (raw.source === "strava" || raw.source === "manual") {
    out.source = raw.source;
  }
  if (
    typeof raw.strava_activity_id === "number" &&
    Number.isFinite(raw.strava_activity_id)
  ) {
    out.strava_activity_id = raw.strava_activity_id;
  }

  return out;
}

export function extractTripMeta(payload: TrailGeoJson | null): TripMeta | null {
  if (payload == null) return null;
  const feature = pickFeature(payload);
  if (!feature) return null;
  return {
    properties: pickProperties(feature),
    coordinates: pickCoordinates(feature),
  };
}
