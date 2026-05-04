/*
 * Wielka Korona Tatr — list of 14 peaks + bagged-detection helpers.
 *
 * The WKT roster is hard-coded by ID against `apps/api/seeds/peaks.json` and
 * ordered to match the official Wikipedia table. Note that seed heights drift
 * by 1–13 m from the canonical heights for some peaks (different cartographic
 * sources); the ordering here is the WKT rank, not a re-sort of the seed
 * heights.
 *
 * Bagged detection is geometric: a peak counts as bagged if any point on any
 * recorded trail comes within BAGGED_THRESHOLD_M metres of the summit. 50m is
 * forgiving enough to absorb GPS noise + summit plateau ambiguity without
 * picking up traverses that merely passed nearby.
 */
import type { Peak, Trail, TripCoordinate } from "@/components/map/types";

// Order = official WKT rank (per pl.wikipedia.org/wiki/Wielka_Korona_Tatr).
// Heights in comments are the canonical values; seed heights differ slightly.
export const WKT_PEAK_IDS: ReadonlyArray<string> = [
  "gerlach",           //  1 · 2655
  "lomnica",           //  2 · 2633
  "lodowy_szczyt",     //  3 · 2627
  "durny_szczyt",      //  4 · 2621
  "wysoka",            //  5 · 2558
  "kiezmarski_szczyt", //  6 · 2557
  "konczysta",         //  7 · 2536
  "baranie_rogi",      //  8 · 2530
  "rysy",              //  9 · 2501
  "krywan",            // 10 · 2495
  "starolesny_szczyt", // 11 · 2489
  "ganek",             // 12 · 2464
  "slawkowski_szczyt", // 13 · 2452
  "posrednia_gran",    // 14 · 2439
];

export const BAGGED_THRESHOLD_M = 50;

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * True if any point on `coords` (a LineString's [lng, lat, ?alt] tuples) lies
 * within `thresholdM` of the peak. Short-circuits on the first hit.
 */
export function isPeakBaggedByCoordinates(
  peak: Pick<Peak, "latitude" | "longitude">,
  coords: TripCoordinate[],
  thresholdM: number = BAGGED_THRESHOLD_M
): boolean {
  if (peak.latitude == null || peak.longitude == null) return false;
  for (const c of coords) {
    const [lng, lat] = c;
    if (haversineMeters(peak.latitude, peak.longitude, lat, lng) <= thresholdM) {
      return true;
    }
  }
  return false;
}

export interface WktPeakStatus {
  peak: Peak;
  bagged: boolean;
  // First trail (manifest order) whose geometry brought us within the bagging
  // threshold of this peak. Set only when `bagged === true`. Used to deep-link
  // a bagged peak back to the home map with the relevant trail spotlit.
  trailId?: string;
}

/**
 * Compute bagged status for the WKT 14, in roster order.
 * `trails` and `trailCoords` are aligned by index — `trailCoords[i]` is the
 * extracted LineString of `trails[i]`. Trails with no usable geometry should
 * be passed in as empty arrays so indices stay aligned for the caller.
 */
export function computeWktStatus(
  peaks: Peak[],
  trails: Trail[],
  trailCoords: TripCoordinate[][]
): WktPeakStatus[] {
  const byId = new Map(peaks.map((p) => [p.id, p]));
  const result: WktPeakStatus[] = [];
  for (const id of WKT_PEAK_IDS) {
    const peak = byId.get(id);
    if (!peak) continue;
    let trailId: string | undefined;
    for (let i = 0; i < trailCoords.length; i++) {
      const coords = trailCoords[i];
      if (coords && isPeakBaggedByCoordinates(peak, coords)) {
        trailId = trails[i]?.id;
        break;
      }
    }
    result.push(
      trailId !== undefined
        ? { peak, bagged: true, trailId }
        : { peak, bagged: false }
    );
  }
  return result;
}
