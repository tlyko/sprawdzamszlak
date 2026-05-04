/*
 * Per-year aggregates over the trip manifest.
 *
 * Pure functions, no React. Inputs: the array of {trail, meta} pairs that the
 * /statystyki/ page already builds from useTripData + extractTripMeta. The
 * aggregator filters by year (from `meta.properties.start_date`) and totals
 * the rest. Trips without a parseable year are dropped — they can't belong to
 * any year bucket and would distort `count`.
 *
 * Sport-type breakdown groups by `meta.properties.sport_type` (raw Strava
 * value — `Hike`, `Walk`, `RockClimbing`, …). The page maps these to Polish
 * labels for display; keeping the raw key here means a new Strava sport type
 * just shows up with its English name rather than silently disappearing.
 */
import type { Trail, TripFeatureProperties } from "@/components/map/types";
import type { TripMeta } from "@/components/logbook/extract-trip-meta";

export interface TripEntry {
  trail: Trail;
  meta: TripMeta;
}

export function parseYear(start_date: string | undefined): number | null {
  if (!start_date) return null;
  // ISO 8601 — first 4 chars are the year. Defensive parseInt because the
  // Strava payload technically allows any string here.
  const year = Number.parseInt(start_date.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

export interface YearStats {
  count: number;
  /** Total distance in metres. Convert at render. */
  distanceM: number;
  /** Total elevation gain in metres. */
  elevationM: number;
  /** Map of raw sport_type → count. */
  sportTypeCounts: Record<string, number>;
  /** Trail with the highest `properties.distance`. Null if no trips. */
  longest: TripHighlight | null;
  /** Trail with the highest `properties.total_elevation_gain`. Null if no trips. */
  highestClimb: TripHighlight | null;
}

export interface TripHighlight {
  trailId: string;
  name: string;
  /** Distance in metres for `longest`, elevation in metres for `highestClimb`. */
  value: number;
}

const EMPTY: YearStats = {
  count: 0,
  distanceM: 0,
  elevationM: 0,
  sportTypeCounts: {},
  longest: null,
  highestClimb: null,
};

export function computeYearStats(trips: TripEntry[], year: number): YearStats {
  const inYear = trips.filter(
    (t) => parseYear(t.meta.properties.start_date) === year
  );
  if (inYear.length === 0) return EMPTY;

  let distanceM = 0;
  let elevationM = 0;
  const sportTypeCounts: Record<string, number> = {};
  let longest: TripHighlight | null = null;
  let highestClimb: TripHighlight | null = null;

  for (const { trail, meta } of inYear) {
    const props: TripFeatureProperties = meta.properties;
    if (typeof props.distance === "number") distanceM += props.distance;
    if (typeof props.total_elevation_gain === "number") {
      elevationM += props.total_elevation_gain;
    }
    const sport = props.sport_type ?? "—";
    sportTypeCounts[sport] = (sportTypeCounts[sport] ?? 0) + 1;

    const name = props.name ?? trail.name;
    if (typeof props.distance === "number" && props.distance > 0) {
      if (!longest || props.distance > longest.value) {
        longest = { trailId: trail.id, name, value: props.distance };
      }
    }
    if (
      typeof props.total_elevation_gain === "number" &&
      props.total_elevation_gain > 0
    ) {
      if (!highestClimb || props.total_elevation_gain > highestClimb.value) {
        highestClimb = {
          trailId: trail.id,
          name,
          value: props.total_elevation_gain,
        };
      }
    }
  }

  return {
    count: inYear.length,
    distanceM,
    elevationM,
    sportTypeCounts,
    longest,
    highestClimb,
  };
}

/** Years (descending) for which we have at least one parseable start_date. */
export function listYears(trips: TripEntry[]): number[] {
  const set = new Set<number>();
  for (const t of trips) {
    const y = parseYear(t.meta.properties.start_date);
    if (y !== null) set.add(y);
  }
  return Array.from(set).sort((a, b) => b - a);
}
