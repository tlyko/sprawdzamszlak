/*
 * Per-trail trail-type overrides applied client-side at fetch time.
 *
 * The Strava fetcher hard-codes `Hike → off-piste` (see
 * `packages/shared/src/index.ts → sportTypeToRouteType`) because in the
 * Tatras the owner's Hike activities are mostly taternictwo / pozaszlakowe
 * podejścia. But some Strava `Hike` entries follow marked PTTK/TANAP
 * trails — owner-curated list below. Until the backend grows a per-route
 * override column on DynamoDB (out of scope for the current frontend
 * passes), these are patched on the way out of `useTripData`.
 *
 * Adding a new override is one line; the override always wins over
 * whatever the manifest says. Removing the heuristic mismatch entirely
 * would mean threading per-trail metadata through the fetcher — bigger
 * change than is warranted right now.
 */
import type { Trail, TrailType } from "@/components/map/types";

const TYPE_OVERRIDE: ReadonlyMap<string, TrailType> = new Map([
  // Owner reclassifications — official PTTK/TANAP marked trails the Strava
  // heuristic would otherwise call off-piste.
  ["strava-7748813491", "official"],   // Kozi Wierch
  ["strava-12161135830", "official"],  // Rysy
  ["strava-15876001309", "official"],  // Krywań
  ["strava-11550081603", "official"],  // Sławkowski Szczyt
  ["strava-11550083200", "official"],  // Teryho Chata
  ["strava-16923048955", "official"],  // Dolina 5 stawów - zimą
]);

export function applyTypeOverrides(trails: Trail[]): Trail[] {
  let changed = false;
  const out = trails.map((t) => {
    const override = TYPE_OVERRIDE.get(t.id);
    if (override !== undefined && override !== t.type) {
      changed = true;
      return { ...t, type: override };
    }
    return t;
  });
  // Skip the array allocation when nothing changed so React's reference
  // equality check on `trails` short-circuits downstream effects.
  return changed ? out : trails;
}
