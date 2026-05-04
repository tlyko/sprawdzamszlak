/*
 * Peak markers — DivIcon system with altitude-tiered sizing and labels.
 *
 * Why DivIcon and not CircleMarker:
 *   1. We can size by altitude tier (summit > high > mid > low).
 *   2. The label is a real DOM node sitting next to the dot — stylable
 *      with CSS, accessible to screen readers, and hit-testable as a single
 *      target.
 *   3. Future keyboard-nav (`tab` through summits) is friendlier with DOM
 *      icons than canvas-rendered CircleMarkers.
 *
 * Visibility model — see docs/design-proposal.md §6.3:
 *   Summit tier (>2400m, ~6 peaks) is always visible with name+altitude.
 *   Each lower tier appears progressively as the user zooms in. The old
 *   blanket "show nothing below zoom 12 + Przybliż mapę hint" rule is gone:
 *   the default landing view at zoom 11 now shows the iconic summits, which
 *   is the entire point of opening the page.
 *
 * Implementation:
 *   We compute (tier, visibility) for each peak from the current zoom and
 *   render only what should be on screen. The Marker uses a DivIcon whose
 *   HTML is built on the client (the component is "use client"-marked) and
 *   carries inline styles that read CSS custom properties — keeping the
 *   palette in one place (globals.css).
 */
"use client";

import { useMemo } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { Peak } from "./types";
import { TIERS, classifyPeak, type PeakTier } from "./peak-tier";

interface PeakMarkersProps {
  peaks: Peak[];
  zoom: number;
}

export function PeakMarkers({ peaks, zoom }: PeakMarkersProps) {
  // Pre-classify and filter once per zoom change. Cheap (~24 peaks today).
  const visiblePeaks = useMemo(() => {
    return peaks
      .filter((p) => p.latitude !== undefined && p.longitude !== undefined)
      .map((peak) => ({
        peak,
        tier: classifyPeak(peak.height),
      }))
      .filter(({ tier }) => zoom >= TIERS[tier].markerMinZoom);
  }, [peaks, zoom]);

  return (
    <>
      {visiblePeaks.map(({ peak, tier }) => (
        <PeakMarker key={peak.id} peak={peak} tier={tier} zoom={zoom} />
      ))}
    </>
  );
}

interface PeakMarkerProps {
  peak: Peak;
  tier: PeakTier;
  zoom: number;
}

function PeakMarker({ peak, tier, zoom }: PeakMarkerProps) {
  const config = TIERS[tier];
  const labelVisible = zoom >= config.labelMinZoom;

  // Build the DivIcon once per (tier, labelVisible) combination. We can't
  // easily memo across components, so per-render allocation is fine — Leaflet
  // hashes by .iconUrl/className internally and our DivIcon is small.
  const icon = useMemo(
    () => buildPeakIcon(peak, tier, labelVisible),
    [peak, tier, labelVisible]
  );

  return (
    <Marker
      position={[peak.latitude as number, peak.longitude as number]}
      icon={icon}
      // Slightly raise the summit tier so labels overlap the right way when
      // peaks are clustered. Higher zIndexOffset = drawn on top.
      zIndexOffset={tier === "summit" ? 1000 : tier === "high" ? 500 : 0}
      keyboard={false}
    >
      <Popup>
        <div className="peak-popup">
          <h3 className="peak-popup__title">
            {peak.nazwa}
            {peak.height !== undefined ? ` (${peak.height} m)` : ""}
          </h3>
          <p className="peak-popup__row">
            <span className="peak-popup__label">Trudność:</span>{" "}
            {peak.trudnosc}
          </p>
        </div>
      </Popup>
    </Marker>
  );
}

/*
 * Build the DivIcon DOM. We intentionally use textContent (via inline HTML
 * built by the browser, but the actual peak.nazwa is escaped first — see the
 * `escape` call) so a future user-controlled peak name can never inject HTML.
 *
 * The icon HTML structure:
 *   .peak-marker
 *     .peak-marker__dot          ← the coloured circle
 *     .peak-marker__label        ← optional pill with name + altitude
 *       .peak-marker__name
 *       .peak-marker__altitude
 *
 * Styling lives in globals.css (.peak-marker__* selectors); inline styles
 * here only carry the per-marker variable bits (size, colour, fill mode).
 */
function buildPeakIcon(
  peak: Peak,
  tier: PeakTier,
  labelVisible: boolean
): L.DivIcon {
  const config = TIERS[tier];
  const fill = `var(${config.fillVar})`;
  const dotStyle = config.filled
    ? `width:${config.size}px;height:${config.size}px;background:${fill};border-color:var(--surface-0);`
    : `width:${config.size}px;height:${config.size}px;background:transparent;border-color:${fill};`;

  const labelHtml = labelVisible
    ? `<span class="peak-marker__label peak-marker__label--${tier}">` +
      `<span class="peak-marker__name">${escape(peak.nazwa)}</span>` +
      (peak.height !== undefined
        ? `<span class="peak-marker__altitude">${peak.height} m</span>`
        : "") +
      `</span>`
    : "";

  const html =
    `<span class="peak-marker peak-marker--${tier}">` +
    `<span class="peak-marker__dot" style="${dotStyle}"></span>` +
    labelHtml +
    `</span>`;

  return L.divIcon({
    html,
    className: "peak-marker-wrap", // empty wrapper class — Leaflet adds .leaflet-div-icon by default which we strip in CSS
    // Anchor at the centre of the dot. The label sits to the right via CSS.
    iconAnchor: [config.size / 2, config.size / 2],
    iconSize: undefined as unknown as L.PointTuple,
    // Prevent the popup from anchoring at the icon's bottom-right (default).
    popupAnchor: [0, -config.size / 2 - 2],
  });
}

// Minimal HTML escape for the peak name so a name like "Mała <Buczynowa>"
// never gets parsed as markup. innerHTML is what Leaflet uses internally for
// DivIcon, so escaping is on us.
function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
