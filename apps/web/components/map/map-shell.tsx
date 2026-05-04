/*
 * Map shell — the MapContainer plus the data fetch + render orchestration.
 *
 * Responsibilities:
 *  1. Fetch peaks (`GET /`) and the trail manifest (`GET /routes`) from the
 *     API, then fan out to fetch each trail's GeoJSON from S3 in parallel.
 *  2. Track the live map zoom so children (PeakMarkers) can react.
 *  3. Compose the four map sub-layers: tile, peak markers, trail overlay,
 *     and (PR 3) the spotlight prop will be threaded through.
 *
 * Why the data fetch lives here rather than in the page:
 *  - The map is the only consumer today. Hoisting the fetch to `app/page.tsx`
 *    is on PR 3's plate (the logbook list also needs trail metadata) — at
 *    that point this component grows a `peaks` / `trails` prop and the fetch
 *    moves up. Until then keeping it co-located avoids prop-drilling for a
 *    consumer of one.
 *  - All of this is browser-only (`'use client'`), so SSR / streaming is not
 *    a concern.
 */
"use client";

import { useEffect, useState } from "react";
import { MapContainer, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { MapTileLayer } from "./tile-layer";
import { PeakMarkers } from "./peak-markers";
import { TrailOverlay } from "./trail-overlay";
import type { Peak, Trail, TrailGeoJson } from "./types";

// Base URL for the API Gateway. Pulled from NEXT_PUBLIC_API_URL when set so
// dev / prod can target different stages without recompiling. The hard-coded
// fallback matches the prod stage and matches the old behaviour of the
// previous TatraMap.tsx so removing the env var doesn't break the live site.
const API_URL_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  "https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod";

const DEFAULT_CENTER: [number, number] = [49.2, 20.05];
const DEFAULT_ZOOM = 11;

// A thin child component that subscribes to map events and pushes the live
// zoom into parent state. Co-located with MapShell because it's the only
// place that needs it.
function ZoomTracker({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
    load: () => onZoom(map.getZoom()),
  });
  return null;
}

export function MapShell() {
  const [peaks, setPeaks] = useState<Peak[]>([]);
  const [trailManifest, setTrailManifest] = useState<Trail[]>([]);
  const [trailGeoData, setTrailGeoData] = useState<TrailGeoJson[]>([]);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch peaks + manifest in parallel. Failures are logged and swallowed so
  // a single endpoint hiccup doesn't blank the whole map — the map renders
  // with whatever loaded.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [peaksRes, routesRes] = await Promise.all([
          fetch(`${API_URL_BASE}/`),
          fetch(`${API_URL_BASE}/routes`),
        ]);

        if (peaksRes.ok) {
          const data: Peak[] = await peaksRes.json();
          if (!cancelled) {
            setPeaks(data.filter((p) => p.latitude && p.longitude));
          }
        } else {
          console.error("[map] peaks fetch failed:", peaksRes.statusText);
        }

        if (routesRes.ok) {
          const data: Trail[] = await routesRes.json();
          if (!cancelled) setTrailManifest(data);
        } else {
          console.error("[map] routes fetch failed:", routesRes.statusText);
        }
      } catch (error) {
        console.error("[map] manifest fetch failed:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Once the manifest lands, kick off the per-trail GeoJSON fetches in
  // parallel. Promise.allSettled means a single broken S3 URL doesn't drop
  // the rest — we filter undefined results out before they hit the overlay.
  useEffect(() => {
    if (trailManifest.length === 0) return;
    let cancelled = false;
    async function loadGeoJson() {
      const settled = await Promise.allSettled(
        trailManifest.map((trail) =>
          fetch(trail.geojson_url).then((res) => {
            if (!res.ok) {
              throw new Error(
                `Failed to fetch ${trail.geojson_url}: ${res.statusText}`
              );
            }
            return res.json();
          })
        )
      );
      if (cancelled) return;
      // Preserve manifest order so TrailOverlay can pair by index.
      setTrailGeoData(
        settled.map((result) => {
          if (result.status === "fulfilled") return result.value;
          console.error("[map] geojson fetch failed:", result.reason);
          return null;
        })
      );
    }
    loadGeoJson();
    return () => {
      cancelled = true;
    };
  }, [trailManifest]);

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center text-ink-2">
        <p className="font-mono text-sm">Wczytuję mapę…</p>
      </main>
    );
  }

  return (
    <main>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom
        // The .leaflet-container CSS in globals.css overrides this to fit
        // between the header and footer; the inline 100vh is a safe default
        // if those CSS rules ever fail to load.
        style={{ height: "100vh", width: "100%" }}
        // Disable Leaflet's default zoom-anim on prefers-reduced-motion. The
        // prop has to be a static literal, so we hand it the matchMedia result
        // — there's no SSR risk because this entire file is client-only.
        zoomAnimation={
          typeof window === "undefined"
            ? true
            : !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        }
      >
        <MapTileLayer />
        <ZoomTracker onZoom={setZoom} />

        <TrailOverlay manifest={trailManifest} geoData={trailGeoData} />

        <PeakMarkers peaks={peaks} zoom={zoom} />
      </MapContainer>
    </main>
  );
}
