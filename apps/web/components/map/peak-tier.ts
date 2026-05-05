/*
 * Peak altitude-tier classifier.
 *
 * Tier drives marker size + colour and per-tier minZoom so the map stays
 * readable as the catalog grows. Originally tuned for ~24 hand-picked
 * peaks; rebalanced in ADR-008 PR 5c after the OSM importer added the
 * full Tatra catalog (~150 peaks ≥1800m with a Wikipedia tag). Labels
 * are intentionally absent from markers — popup-on-click only, per
 * May 2026 owner feedback.
 *
 * Rough distribution after the OSM import:
 *   summit  ≥2500m  ~15  ← Gerlach, Rysy, Vysoká, Łomnica, Lodowy, …
 *   high    ≥2300m  ~50  ← Koscielec, Krywań tier
 *   mid     ≥2100m  ~80  ← Bielskie, mid-range Western Tatra peaks
 *   low     <2100m  rest (with the importer's ≥1800m floor)
 *
 * markerMinZoom gates how many dots appear at each zoom — at the default
 * zoom 11 the user sees ~65 dots (summit + high) instead of all 150.
 * Zooming in reveals more.
 */

export type PeakTier = "summit" | "high" | "mid" | "low";

export interface PeakTierConfig {
  size: number;
  fillVar: string;
  filled: boolean;
  markerMinZoom: number;
}

export const TIERS: Record<PeakTier, PeakTierConfig> = {
  // Always-visible tier kept tight (≥2600m → ~10 peaks) so the default
  // zoom 11 view shows a clean constellation, not a swarm.
  summit: { size: 9, fillVar: "--alt-summit", filled: true, markerMinZoom: 0 },
  high: { size: 7, fillVar: "--alt-high", filled: true, markerMinZoom: 12 },
  mid: { size: 5, fillVar: "--alt-mid", filled: false, markerMinZoom: 13 },
  low: { size: 3, fillVar: "--alt-low", filled: false, markerMinZoom: 14 },
};

// Real OSM-imported catalog (~320 peaks ≥1800m with Wikipedia tag) was
// denser than the original ~150 estimate, so thresholds + min-zoom are
// tighter than ADR-008 PR 5c shipped. At default zoom 11 only the
// summit tier (≥2600m, ~10 peaks) renders. Each zoom step in reveals a
// tier:
//   zoom 11  summit                ~10 dots — clean low-zoom view
//   zoom 12  + high (≥2400m)       ~50 dots
//   zoom 13  + mid  (≥2200m)       ~150 dots
//   zoom 14+ + low                 all
export function classifyPeak(height: number | undefined): PeakTier {
  if (height === undefined) return "low";
  if (height >= 2600) return "summit";
  if (height >= 2400) return "high";
  if (height >= 2200) return "mid";
  return "low";
}
