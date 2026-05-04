/*
 * Tile layer — Stadia Outdoors as primary, OSM as fallback.
 *
 * Per docs/design-proposal.md §6 "Tile layer choice":
 *   Stadia Outdoors (https://docs.stadiamaps.com/themes/#outdoors) is the
 *   right cartographic substrate for a Tatra mountain log: contour-rich,
 *   restrained palette, hill-shading. Free up to 200k tile requests/month
 *   with attribution + a free API key.
 *
 * Key plumbing:
 *   We're a static export (`output: 'export'`), so runtime env vars don't
 *   exist. The Stadia key is baked at build time as NEXT_PUBLIC_STADIA_KEY
 *   and surfaced through process.env. Production: set it in the Cloudflare
 *   Workers Builds env (Cloudflare dashboard → Workers & Pages → the project
 *   → Settings → Variables and Secrets) so it's injected during `next build`.
 *   Locally: copy .env.example → .env.local and fill it in.
 *
 * Fallback strategy:
 *   When the key is absent we silently swap to plain OSM tiles. The map keeps
 *   working in dev without anyone needing to register, and a missing prod key
 *   degrades to "looks like before" rather than "blank canvas". One console
 *   warning fires per page-load (in dev) so the omission is visible without
 *   spamming production logs.
 */
"use client";

import { useEffect, useMemo } from "react";
import { TileLayer } from "react-leaflet";

const STADIA_KEY = process.env.NEXT_PUBLIC_STADIA_KEY;

// Stadia attribution string. Required by their terms whenever Stadia tiles
// are served; we render it via the standard Leaflet attribution control.
const STADIA_ATTRIBUTION = [
  '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noopener">Stadia Maps</a>',
  '&copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a>',
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
].join(" ");

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

export function MapTileLayer() {
  const useStadia = Boolean(STADIA_KEY);

  // One-shot dev warning when the key is missing. We swallow this in
  // production so a misconfigured deploy doesn't dump a console.warn on every
  // visitor.
  useEffect(() => {
    if (!useStadia && process.env.NODE_ENV !== "production") {
      console.warn(
        "[map] NEXT_PUBLIC_STADIA_KEY is not set — falling back to OSM tiles. " +
          "Set it in apps/web/.env.local for parity with production."
      );
    }
  }, [useStadia]);

  // Memoise the URL so the TileLayer's key changes only when the substrate
  // actually swaps (cheap insurance against unnecessary re-mounts).
  const tile = useMemo(() => {
    if (useStadia) {
      return {
        // Outdoors is the topographic style with contours + hill-shading.
        // {r} is Stadia's retina suffix; Leaflet replaces it with "@2x" on
        // high-DPI screens and "" otherwise.
        url: `https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.png?api_key=${STADIA_KEY}`,
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
      // Forcing a unique key on substrate swap avoids a stale-tile flash if
      // the key flips between renders (it shouldn't, but cheap to guarantee).
      key={useStadia ? "stadia-outdoors" : "osm-fallback"}
      url={tile.url}
      attribution={tile.attribution}
      maxZoom={tile.maxZoom}
      // Detect retina displays automatically; only honoured by Stadia (the
      // {r} placeholder is a no-op on the OSM URL).
      detectRetina
    />
  );
}
