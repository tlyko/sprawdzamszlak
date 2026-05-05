/*
 * Map shell — the MapContainer plus map sub-layer composition.
 *
 * As of PR 3 ("logbook-home") the data fetch was hoisted to the page level
 * (apps/web/app/page.tsx) — the trip list and the map both need the same
 * `Trail[]`, and the page owns the `selectedTripId` that wires them together.
 * This component is now a pure render of the map, driven by props.
 *
 * Responsibilities:
 *  1. Render the MapContainer with tile layer, peak markers, and trail overlay.
 *  2. Track the live map zoom so PeakMarkers can react.
 *  3. On selectedTripId change, fly the map to that trail's bounds.
 *
 * The `selectedTripId` prop is the seam for PR 3's logbook: when set, the
 * trail-overlay spotlights that trail and dims the others (the prop is
 * forwarded into TrailOverlay which already implements the visual side).
 */
"use client";

import { useEffect, useState } from "react";
import { MapContainer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { GeoJsonObject } from "geojson";
// leaflet.css is imported in app/layout.tsx (above globals.css) so the
// cascade order lets globals.css override leaflet's defaults — keeping
// the import here would re-add it after globals.css and re-introduce the
// dark-mode popup readability bug.

import { MapTileLayer } from "./tile-layer";
import { PeakMarkers } from "./peak-markers";
import { TrailOverlay } from "./trail-overlay";
import type { Peak, Trail, TrailGeoJson } from "./types";

const DEFAULT_CENTER: [number, number] = [49.2, 20.05];
const DEFAULT_ZOOM = 11;

// Padding (px) when flying to a trail's bounds. Matches §6 of the proposal.
const FLY_TO_PADDING: [number, number] = [80, 80];
const FLY_TO_DURATION_S = 1.2;

export interface MapShellProps {
  peaks: Peak[];
  trails: Trail[];
  trailGeoData: TrailGeoJson[];
  // PR 3: which trail is currently spotlit. null/undefined = no spotlight.
  selectedTripId?: string | null;
  // Called when a trail is clicked directly on the map; lets the page sync
  // the list selection with map clicks (bidirectional selection).
  onTripSelect?: (trailId: string | null) => void;
}

// Subscribes to map events and pushes the live zoom into parent state. The
// zoom value is consumed by PeakMarkers to decide which tier renders.
function ZoomTracker({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
    load: () => onZoom(map.getZoom()),
  });
  return null;
}

// When selectedTripId changes, fly the map to that trail's bounding box. We
// recompute the bounds here (rather than caching) because the GeoJSON payload
// is small (a polyline) and L.geoJSON().getBounds() is O(n_points). Cheap.
function FlyToSelected({
  trails,
  trailGeoData,
  selectedTripId,
}: {
  trails: Trail[];
  trailGeoData: TrailGeoJson[];
  selectedTripId: string | null | undefined;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedTripId) return;
    const index = trails.findIndex((t) => t.id === selectedTripId);
    if (index === -1) return;
    const geoJson = trailGeoData[index];
    if (!geoJson) return;

    // The TrailGeoJson alias is intentionally loose (unknown) — see
    // components/map/types.ts. Cast through unknown to GeoJsonObject for
    // Leaflet's own GeoJSON layer constructor; the runtime accepts any
    // valid GeoJSON, mismatches surface as an empty bounds we then skip.
    const bounds = L.geoJSON(geoJson as GeoJsonObject).getBounds();
    if (!bounds.isValid()) return;

    // Respect prefers-reduced-motion: skip the flight, just fit.
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      map.fitBounds(bounds, { padding: FLY_TO_PADDING, animate: false });
    } else {
      map.flyToBounds(bounds, {
        padding: FLY_TO_PADDING,
        duration: FLY_TO_DURATION_S,
      });
    }
  }, [map, trails, trailGeoData, selectedTripId]);

  return null;
}

export function MapShell({
  peaks,
  trails,
  trailGeoData,
  selectedTripId = null,
  onTripSelect,
}: MapShellProps) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      // The wrapper element (<main>, <section>) sizes the container; the
      // 100% inline style lets the MapContainer fill whatever slot it lives
      // in (full viewport on desktop right column, 40vh slab on mobile).
      style={{ height: "100%", width: "100%" }}
      // Disable Leaflet's default zoom-anim on prefers-reduced-motion. The
      // prop has to be a static literal, so we hand it the matchMedia result
      // — no SSR risk because this entire file is client-only.
      zoomAnimation={
        typeof window === "undefined"
          ? true
          : !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      }
    >
      <MapTileLayer />
      <ZoomTracker onZoom={setZoom} />
      <FlyToSelected
        trails={trails}
        trailGeoData={trailGeoData}
        selectedTripId={selectedTripId}
      />

      <TrailOverlay
        manifest={trails}
        geoData={trailGeoData}
        selectedTrailId={selectedTripId ?? null}
        {...(onTripSelect ? { onTrailClick: (id) => onTripSelect(id) } : {})}
      />

      <PeakMarkers peaks={peaks} zoom={zoom} />
    </MapContainer>
  );
}
