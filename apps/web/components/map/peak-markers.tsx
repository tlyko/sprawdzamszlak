/*
 * Peak markers — dots only. The peak's name + altitude + difficulty live in
 * the popup that opens on click; no always-visible labels (live-site
 * feedback May 2026 — owner explicitly preferred elegant dots over pills).
 *
 * Tier still drives size + colour so summits read as more prominent than
 * minor peaks, but the entire pill+label DOM is gone. The Tatras cluster at
 * default zoom now shows as a constellation of dots, not stacked text.
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
  const visiblePeaks = useMemo(() => {
    return peaks
      .filter((p) => p.latitude !== undefined && p.longitude !== undefined)
      .map((peak) => ({ peak, tier: classifyPeak(peak.height) }))
      .filter(({ tier }) => zoom >= TIERS[tier].markerMinZoom);
  }, [peaks, zoom]);

  return (
    <>
      {visiblePeaks.map(({ peak, tier }) => (
        <PeakMarker key={peak.id} peak={peak} tier={tier} />
      ))}
    </>
  );
}

interface PeakMarkerProps {
  peak: Peak;
  tier: PeakTier;
}

function PeakMarker({ peak, tier }: PeakMarkerProps) {
  const config = TIERS[tier];
  const icon = useMemo(() => buildDotIcon(tier), [tier]);

  return (
    <Marker
      position={[peak.latitude as number, peak.longitude as number]}
      icon={icon}
      // Higher-tier dots draw on top when peaks are clustered.
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

function buildDotIcon(tier: PeakTier): L.DivIcon {
  const config = TIERS[tier];
  const fill = `var(${config.fillVar})`;
  const dotStyle = config.filled
    ? `width:${config.size}px;height:${config.size}px;background:${fill};border-color:var(--surface-0);`
    : `width:${config.size}px;height:${config.size}px;background:transparent;border-color:${fill};`;

  return L.divIcon({
    html:
      `<span class="peak-marker peak-marker--${tier}">` +
      `<span class="peak-marker__dot" style="${dotStyle}"></span>` +
      `</span>`,
    className: "peak-marker-wrap",
    iconAnchor: [config.size / 2, config.size / 2],
    iconSize: undefined as unknown as L.PointTuple,
    popupAnchor: [0, -config.size / 2 - 2],
  });
}
