/*
 * Tile layer — Stadia Outdoors as primary substrate.
 *
 * Per docs/design-proposal.md §6 "Tile layer choice": Stadia Outdoors
 * (https://docs.stadiamaps.com/themes/#outdoors) — contour-rich, restrained
 * palette, hill-shading. Free up to 200k tile requests/month with attribution.
 *
 * Auth modes:
 *   1. Domain-based (preferred, default): no key in URL, Stadia validates
 *      Referer against the property's authorized domains. Configure the
 *      property in Stadia client dashboard → Manage Properties.
 *   2. API key: set NEXT_PUBLIC_STADIA_KEY in the build env (Cloudflare
 *      Workers Builds → Variables and Secrets) and it gets appended as
 *      ?api_key=…. Belt-and-braces with domain restriction; not required.
 *
 * Dev fallback:
 *   If NEXT_PUBLIC_USE_OSM=true is set we render plain OSM tiles instead.
 *   Useful when working from a machine whose Referer (e.g. localhost) is
 *   not registered as a Stadia property.
 */
"use client";

import { useEffect, useMemo } from "react";
import { TileLayer } from "react-leaflet";

const STADIA_KEY = process.env.NEXT_PUBLIC_STADIA_KEY;
const USE_OSM = process.env.NEXT_PUBLIC_USE_OSM === "true";

const STADIA_ATTRIBUTION = [
  '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noopener">Stadia Maps</a>',
  '&copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a>',
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
].join(" ");

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

export function MapTileLayer() {
  const useStadia = !USE_OSM;

  useEffect(() => {
    if (USE_OSM && process.env.NODE_ENV !== "production") {
      console.info("[map] NEXT_PUBLIC_USE_OSM=true — rendering OSM tiles.");
    }
  }, []);

  const tile = useMemo(() => {
    if (useStadia) {
      // {r} is Stadia's retina suffix; Leaflet replaces with "@2x" on
      // high-DPI screens and "" otherwise.
      const base = `https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.png`;
      return {
        url: STADIA_KEY ? `${base}?api_key=${STADIA_KEY}` : base,
        attribution: STADIA_ATTRIBUTION,
        maxZoom: 20,
      };
    }
    return {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    };
  }, [useStadia]);

  return (
    <TileLayer
      key={useStadia ? "stadia-outdoors" : "osm"}
      url={tile.url}
      attribution={tile.attribution}
      maxZoom={tile.maxZoom}
      // Retina hint; only Stadia honours the {r} placeholder.
      detectRetina
    />
  );
}
