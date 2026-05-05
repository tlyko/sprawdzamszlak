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
  summit: { size: 9, fillVar: "--alt-summit", filled: true, markerMinZoom: 0 },
  high: { size: 7, fillVar: "--alt-high", filled: true, markerMinZoom: 11 },
  mid: { size: 5, fillVar: "--alt-mid", filled: false, markerMinZoom: 12 },
  low: { size: 3, fillVar: "--alt-low", filled: false, markerMinZoom: 13 },
};

export function classifyPeak(height: number | undefined): PeakTier {
  if (height === undefined) return "low";
  if (height >= 2500) return "summit";
  if (height >= 2300) return "high";
  if (height >= 2100) return "mid";
  return "low";
}
