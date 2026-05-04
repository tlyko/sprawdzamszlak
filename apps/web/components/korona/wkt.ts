/*
 * Wielka Korona Tatr — list of 14 peaks + bagged-detection helpers.
 *
 * The WKT roster is a popular (not officially sanctioned) list of the 14
 * highest peaks of the Tatras. We hard-code the IDs against
 * `apps/api/seeds/peaks.json` rather than computing top-N-by-height: the seed
 * also includes peaks that aren't WKT (Rysy, Giewont) and the height ranking
 * isn't a clean cutoff once you exclude them.
 *
 * Bagged detection is geometric: a peak counts as bagged if any point on any
 * recorded trail comes within BAGGED_THRESHOLD_M metres of the summit. 50m is
 * forgiving enough to absorb GPS noise + summit plateau ambiguity without
 * picking up traverses that merely passed nearby.
 */
import type { Peak, TripCoordinate } from "@/components/map/types";

export const WKT_PEAK_IDS: ReadonlyArray<string> = [
  "gerlach",           // 2655
  "lomnica",           // 2633
  "lodowy_szczyt",     // 2627
  "durny_szczyt",      // 2621
  "lodowa_kopa",       // 2602
  "kiezmarski_szczyt", // 2558
  "wysoka",            // 2547
  "konczysta",         // 2538
  "baranie_rogi",      // 2530
  "krywan",            // 2495
  "starolesny_szczyt", // 2476
  "ganek",             // 2462
  "slawkowski_szczyt", // 2452
  "posrednia_gran",    // 2439
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
}

/**
 * Compute bagged status for the WKT 14, in roster order.
 * `trailCoords` is the array of LineString coordinates per trail (already
 * extracted from each trail's GeoJSON). Trails with no usable geometry should
 * be passed in as empty arrays so indices stay aligned for the caller.
 */
export function computeWktStatus(
  peaks: Peak[],
  trailCoords: TripCoordinate[][]
): WktPeakStatus[] {
  const byId = new Map(peaks.map((p) => [p.id, p]));
  const result: WktPeakStatus[] = [];
  for (const id of WKT_PEAK_IDS) {
    const peak = byId.get(id);
    if (!peak) continue;
    let bagged = false;
    for (const coords of trailCoords) {
      if (isPeakBaggedByCoordinates(peak, coords)) {
        bagged = true;
        break;
      }
    }
    result.push({ peak, bagged });
  }
  return result;
}
