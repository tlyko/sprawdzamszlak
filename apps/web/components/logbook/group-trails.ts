/*
 * Logbook list grouping + filtering helpers.
 *
 * Filters `Trail[]` by type pill, then groups remaining trails by the year
 * extracted from `properties.start_date` (per-trail GeoJSON). Year-less
 * trails — manual seeds without a start_date, or any older Strava import
 * pre-dating the field — collapse into a single "bez daty" bucket that
 * sorts last. Within each year-group, trails sort by start_date desc.
 *
 * Pure: no React. The list component memoises the result against
 * (trails, trailGeoData, filter).
 */
import { extractTripMeta } from "./extract-trip-meta";
import { parseYear } from "@/components/statystyki/aggregate";
import type { Trail, TrailGeoJson, TrailType } from "@/components/map/types";

export type LogbookFilter = "all" | TrailType;

export interface YearGroup {
  /** Year (YYYY) for the group, or null for the "bez daty" bucket. */
  year: number | null;
  /** Trails in reverse-chronological order within the group. */
  trails: Trail[];
}

/**
 * Group filtered trails by year, descending. `trailGeoData` aligns with
 * `trails` by index — used both to read each trail's start_date and to
 * sort within a year. Trails whose GeoJSON we couldn't parse keep their
 * spot in the "bez daty" bucket.
 */
export function groupTrailsByYear(
  trails: Trail[],
  trailGeoData: TrailGeoJson[],
  filter: LogbookFilter
): YearGroup[] {
  // Decorate once: pull start_date out of each trail's geojson so the
  // grouping pass doesn't re-walk extractTripMeta repeatedly.
  type Decorated = { trail: Trail; year: number | null; sortKey: string };
  const decorated: Decorated[] = trails
    .map((trail, i) => {
      const meta = extractTripMeta(trailGeoData[i] ?? null);
      const startDate = meta?.properties.start_date;
      return {
        trail,
        year: parseYear(startDate),
        // Empty string sorts last under desc localeCompare on ISO strings.
        sortKey: startDate ?? "",
      };
    })
    .filter(({ trail }) => filter === "all" || trail.type === filter);

  // Group by year (null bucket survives separately).
  const buckets = new Map<number | null, Decorated[]>();
  for (const d of decorated) {
    const arr = buckets.get(d.year) ?? [];
    arr.push(d);
    buckets.set(d.year, arr);
  }

  // Sort years desc, with null last; sort within each by start_date desc.
  const years = Array.from(buckets.keys()).sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
  });

  return years.map((year) => {
    const list = buckets.get(year)!;
    list.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    return { year, trails: list.map((d) => d.trail) };
  });
}
