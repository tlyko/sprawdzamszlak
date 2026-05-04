/*
 * Peak altitude-tier classifier.
 *
 * Per docs/design-proposal.md §6.3, peaks are bucketed by elevation into
 * four visual tiers. Each tier has its own marker size, label colour, and
 * minimum-zoom threshold for label visibility.
 *
 * Tier breakpoints are intentionally simple (one number, exclusive on the
 * upper bound, inclusive on the lower) so a quick `peak.height >= X ?` chain
 * reads naturally. The exact thresholds match the proposal verbatim.
 *
 * Notes:
 *  - The "summit" tier is reserved for the famous handful of >2400m peaks
 *    (Gerlach, Łomnica, Lodowy, Wysoka, Rysy, Krywań). They always render
 *    with a label, regardless of zoom — they're navigational landmarks.
 *  - Peaks without a `height` value are classified as "low" so they at least
 *    show a small marker rather than disappearing entirely.
 */

export type PeakTier = "summit" | "high" | "mid" | "low";

export interface PeakTierConfig {
  // Diameter of the marker dot in pixels.
  size: number;
  // Token name for the dot fill colour (so callers can build the inline
  // style with `var(--alt-summit)` etc., consistent with the rest of the UI).
  fillVar: string;
  // Whether the marker is filled or outline-only.
  filled: boolean;
  // Minimum map zoom at which the peak's name+altitude label appears.
  // Use 0 for "always visible" (summit tier).
  labelMinZoom: number;
  // Minimum zoom for the dot itself. Below this the peak does not render at
  // all. Useful so zoom 8 doesn't spray hundreds of low peaks across the arc.
  markerMinZoom: number;
}

export const TIERS: Record<PeakTier, PeakTierConfig> = {
  summit: {
    size: 9,
    fillVar: "--alt-summit",
    filled: true,
    labelMinZoom: 0, // always
    markerMinZoom: 0,
  },
  high: {
    size: 7,
    fillVar: "--alt-high",
    filled: true,
    // Was 11 — bumped to 12 after live-site feedback that the central Tatras
    // cluster was unreadable at the default zoom (11). High-tier dots stay
    // visible as orientation cues; their labels only appear once we're at
    // massif level (zoom 12+).
    labelMinZoom: 12,
    markerMinZoom: 10,
  },
  mid: {
    size: 5,
    fillVar: "--alt-mid",
    filled: false,
    labelMinZoom: 13,
    markerMinZoom: 11,
  },
  low: {
    size: 3,
    fillVar: "--alt-low",
    filled: false,
    labelMinZoom: 14,
    markerMinZoom: 13,
  },
};

export function classifyPeak(height: number | undefined): PeakTier {
  if (height === undefined) return "low";
  if (height >= 2400) return "summit";
  if (height >= 2000) return "high";
  if (height >= 1500) return "mid";
  return "low";
}
