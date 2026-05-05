/*
 * use-trip-data — fetch peaks + trail manifest + per-trail GeoJSON for the
 * logbook home page.
 *
 * Why hoisted to the page level (out of MapShell):
 *   PR 3 introduces a second consumer of the trail manifest — the trip list
 *   on the left column. Both list and map need the same `Trail[]`, and the
 *   page owns the `selectedTripId` that wires them together. Keeping the
 *   fetch inside MapShell would force the list to either re-fetch (wasteful,
 *   double network calls) or to read from a global. The page is the right
 *   single owner — see docs/design-proposal.md §8 PR 3.
 *
 * Failure mode is intentional: peaks and routes fetch in parallel, each
 * failure is logged and swallowed, and per-trail GeoJSON failures are
 * isolated via Promise.allSettled so one broken S3 URL doesn't blank the
 * map. The component renders whatever loaded.
 */
"use client";

import { useEffect, useState } from "react";
import type { Peak, Trail, TrailGeoJson } from "@/components/map/types";
import { API_BASE } from "@/lib/api-base";
import { applyTypeOverrides } from "./type-overrides";

const API_URL_BASE = API_BASE;

export interface TripData {
  peaks: Peak[];
  trails: Trail[];
  // Per-trail GeoJSON aligned by index with `trails`. `null` slots mark a
  // trail whose S3 fetch failed — TrailOverlay filters these out.
  trailGeoData: TrailGeoJson[];
  isLoading: boolean;
}

export function useTripData(): TripData {
  const [peaks, setPeaks] = useState<Peak[]>([]);
  const [trails, setTrails] = useState<Trail[]>([]);
  const [trailGeoData, setTrailGeoData] = useState<TrailGeoJson[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
          console.error("[logbook] peaks fetch failed:", peaksRes.statusText);
        }

        if (routesRes.ok) {
          const data: Trail[] = await routesRes.json();
          if (!cancelled) setTrails(applyTypeOverrides(data));
        } else {
          console.error("[logbook] routes fetch failed:", routesRes.statusText);
        }
      } catch (error) {
        console.error("[logbook] manifest fetch failed:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Once the manifest lands, fan out per-trail GeoJSON requests. allSettled
  // so a single broken URL doesn't drop the rest; index-aligned with `trails`.
  useEffect(() => {
    if (trails.length === 0) return;
    let cancelled = false;
    async function loadGeoJson() {
      const settled = await Promise.allSettled(
        trails.map((trail) =>
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
      setTrailGeoData(
        settled.map((result) => {
          if (result.status === "fulfilled") return result.value;
          console.error("[logbook] geojson fetch failed:", result.reason);
          return null;
        })
      );
    }
    loadGeoJson();
    return () => {
      cancelled = true;
    };
  }, [trails]);

  return { peaks, trails, trailGeoData, isLoading };
}
