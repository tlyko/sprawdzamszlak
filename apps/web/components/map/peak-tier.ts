/*
 * Peak altitude-tier classifier.
 *
 * Tier drives only marker size + colour now (labels removed in May 2026
 * per owner feedback — name + altitude live in the click popup instead).
 * `markerMinZoom` keeps low-tier peaks from spraying across the arc when
 * zoomed out.
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
  high: { size: 7, fillVar: "--alt-high", filled: true, markerMinZoom: 10 },
  mid: { size: 5, fillVar: "--alt-mid", filled: false, markerMinZoom: 11 },
  low: { size: 3, fillVar: "--alt-low", filled: false, markerMinZoom: 13 },
};

export function classifyPeak(height: number | undefined): PeakTier {
  if (height === undefined) return "low";
  if (height >= 2400) return "summit";
  if (height >= 2000) return "high";
  if (height >= 1500) return "mid";
  return "low";
}
