/*
 * Trail overlay — renders one Leaflet GeoJSON layer per trail in the manifest,
 * with hover and (PR 3) spotlight states.
 *
 * Why one component per index, not a single FeatureCollection:
 *   We need per-trail styling (`trail.type` → colour) and per-trail popup
 *   metadata (the manifest entry, not the GeoJSON properties). Merging into a
 *   FeatureCollection would force us to repeat the manifest into every Feature
 *   first; cheaper to just render N <GeoJSON /> children.
 *
 * Spotlight (selectedTrailId) is the seam for PR 3's logbook: when a trip row
 * is selected, that trail draws bold and the others dim to 25% opacity. This
 * PR doesn't drive that prop yet — it's wired and ready.
 *
 * Popups: built imperatively as DOM nodes (textContent, not innerHTML) so the
 * trail name can never be interpreted as HTML if the manifest ever ingests
 * user-controlled strings in the future. Same pattern the original component
 * used; preserved here.
 */
"use client";

import { useEffect, useMemo, useRef } from "react";
import { GeoJSON } from "react-leaflet";
import type { GeoJSON as LeafletGeoJSON, Layer, Path } from "leaflet";
import type { Feature, GeoJsonObject } from "geojson";
import type { Trail, TrailGeoJson, TrailType, TripFeatureProperties } from "./types";
import {
  getTrailDimmedStyle,
  getTrailHoverStyle,
  getTrailSelectedStyle,
  getTrailStyle,
} from "./trail-style";

// Polish popup labels for the five TrailType values. Mirrors `type-pill.tsx`
// (which uses lowercase chip wording) but capitalised for popup-headline use.
// Out-of-band on TrailType extension this fails the type-checker — record
// must enumerate every variant.
const TRAIL_TYPE_POPUP_LABEL: Record<TrailType, string> = {
  official: "Oficjalny szlak",
  "off-piste": "Pozaszlak",
  walk: "Spacer",
  "ski-tour": "Skitur",
  climbing: "Wspinaczka",
};

const POPUP_DATE_MONTHS = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
] as const;

function formatPopupDate(isoString: string | undefined): string | null {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  const month = POPUP_DATE_MONTHS[d.getMonth()];
  if (!month) return null;
  return `${d.getDate()} ${month} ${d.getFullYear()}`;
}

interface TrailOverlayProps {
  manifest: Trail[];
  geoData: TrailGeoJson[];
  // PR 3 plug-in: when set, that trail spotlights and others dim. Pass null to
  // disable.
  selectedTrailId?: string | null;
  // Optional callback when a trail is clicked — PR 3's logbook uses this to
  // open the corresponding row.
  onTrailClick?: (trailId: string) => void;
}

export function TrailOverlay({
  manifest,
  geoData,
  selectedTrailId = null,
  onTrailClick,
}: TrailOverlayProps) {
  // Pair (trail, geojson) by index. The fetch order in MapShell matches the
  // manifest order, so this is safe — but we filter out misaligned/missing
  // entries defensively.
  const items = useMemo(
    () =>
      manifest
        .map((trail, index) => ({ trail, geoJson: geoData[index] }))
        .filter((it): it is { trail: Trail; geoJson: TrailGeoJson } =>
          Boolean(it.trail && it.geoJson)
        ),
    [manifest, geoData]
  );

  return (
    <>
      {items.map(({ trail, geoJson }) => (
        <TrailLayer
          key={trail.id}
          trail={trail}
          geoJson={geoJson}
          isSelected={selectedTrailId === trail.id}
          isDimmed={selectedTrailId !== null && selectedTrailId !== trail.id}
          onTrailClick={onTrailClick}
        />
      ))}
    </>
  );
}

interface TrailLayerProps {
  trail: Trail;
  geoJson: TrailGeoJson;
  isSelected: boolean;
  isDimmed: boolean;
  onTrailClick: ((trailId: string) => void) | undefined;
}

function TrailLayer({
  trail,
  geoJson,
  isSelected,
  isDimmed,
  onTrailClick,
}: TrailLayerProps) {
  // Hold a ref to the underlying Leaflet layer group so we can re-style it
  // when isSelected / isDimmed flips without rebuilding the GeoJSON layer.
  // (Re-rendering <GeoJSON> with a changed `style` prop is silently ignored
  // by react-leaflet — known footgun. Imperative restyle is the supported
  // path.)
  const layerRef = useRef<LeafletGeoJSON | null>(null);

  // Build the resting style once. Selected / dimmed are applied imperatively.
  const restingStyle = useMemo(() => getTrailStyle(trail), [trail]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    if (isSelected) {
      layer.setStyle(getTrailSelectedStyle(trail));
      layer.bringToFront();
    } else if (isDimmed) {
      layer.setStyle(getTrailDimmedStyle(trail));
    } else {
      layer.setStyle(getTrailStyle(trail));
    }
  }, [trail, isSelected, isDimmed]);

  return (
    <GeoJSON
      ref={(instance) => {
        layerRef.current = instance ?? null;
      }}
      // Re-mount the layer when geoJson changes (it shouldn't normally — the
      // S3 payload is stable per route id).
      data={geoJson as GeoJsonObject}
      style={restingStyle}
      onEachFeature={(feature: Feature, layer: Layer) => {
        // Popup with the manifest's name + Polish type label + (when the
        // GeoJSON Feature carries it) the date of the activity.
        // Built as DOM, never as an HTML string — see the file header.
        const container = document.createElement("div");
        container.className = "trail-popup";

        const heading = document.createElement("h3");
        heading.className = "trail-popup__title";
        heading.textContent = trail.name;

        const typeLine = document.createElement("p");
        typeLine.className = "trail-popup__type";
        typeLine.textContent = TRAIL_TYPE_POPUP_LABEL[trail.type];

        container.append(heading, typeLine);

        const props = feature.properties as TripFeatureProperties | null;
        const dateText = formatPopupDate(props?.start_date);
        if (dateText) {
          const dateLine = document.createElement("p");
          dateLine.className = "trail-popup__date";
          dateLine.textContent = dateText;
          container.append(dateLine);
        }

        layer.bindPopup(container);

        // Hover handlers operate on the same Leaflet layer instance. We skip
        // the hover restyle when this trail is currently spotlit so a hover
        // doesn't briefly downsize the selected line.
        layer.on({
          mouseover: (e) => {
            if (isSelected) return;
            const target = e.target as Path;
            target.setStyle(getTrailHoverStyle(trail));
            target.bringToFront();
          },
          mouseout: (e) => {
            if (isSelected) return;
            const target = e.target as Path;
            target.setStyle(
              isDimmed ? getTrailDimmedStyle(trail) : getTrailStyle(trail)
            );
          },
          click: () => {
            onTrailClick?.(trail.id);
          },
        });
      }}
    />
  );
}
