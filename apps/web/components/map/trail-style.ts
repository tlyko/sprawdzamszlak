/*
 * Per-trail-type style functions.
 *
 * Colour values are sourced from CSS custom properties defined in
 * app/globals.css (--alpine-sky, --rusalka, …). Leaflet sets stroke colours
 * imperatively via JS, not CSS, so we read the variable values at module
 * import time and cache them. This means a single source of truth (the token
 * file), without the runtime cost of a getComputedStyle on every polyline.
 *
 * Per docs/design-proposal.md §6.2:
 *   official    → alpine-sky, solid, weight 3
 *   off-piste   → rusalka,    dashed, weight 2.5
 *
 * Hover: weight +1, opacity 100%.
 * Selected (PR 3 plug-in): weight +2, opacity 100%, others dim to 25%.
 */
import type { PathOptions } from "leaflet";
import type { Trail, TrailType } from "./types";

// Read a CSS variable from :root with a fallback. We only call this in the
// browser (the trail overlay is a client component and doesn't render on
// the server), but guard for safety so that any future SSR path doesn't
// throw.
function readToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

// Lazy-init the colour cache on first call so it picks up the actual computed
// values once the page styles are applied. Recomputed on each call would be
// wasteful for a list of ~50 trails.
let palette: Record<TrailType, string> | null = null;
function getPalette(): Record<TrailType, string> {
  if (palette) return palette;
  palette = {
    official: readToken("--alpine-sky", "#6fa8c4"),
    "off-piste": readToken("--rusalka", "#c4744a"),
  };
  return palette;
}

// Base style — "resting" state of the trail.
export function getTrailStyle(trail: Trail): PathOptions {
  const colors = getPalette();
  switch (trail.type) {
    case "official":
      return {
        color: colors.official,
        weight: 3,
        opacity: 0.85,
      };
    case "off-piste":
      return {
        color: colors["off-piste"],
        weight: 2.5,
        opacity: 0.9,
        dashArray: "6 8",
      };
    default:
      // Future trail types render as muted ink-3 hairlines until we style
      // them explicitly; this prevents the "invisible polyline" failure mode.
      return {
        color: readToken("--ink-3", "#6e7480"),
        weight: 2,
        opacity: 0.7,
      };
  }
}

// Hover style — bumps the trail forward without recolouring.
export function getTrailHoverStyle(trail: Trail): PathOptions {
  const base = getTrailStyle(trail);
  return {
    ...base,
    weight: (typeof base.weight === "number" ? base.weight : 2) + 1,
    opacity: 1,
  };
}

// Spotlight style — applied to the selected trail; siblings should be dimmed
// by the caller (see TrailOverlay / map shell). Used by PR 3's logbook click.
export function getTrailSelectedStyle(trail: Trail): PathOptions {
  const base = getTrailStyle(trail);
  return {
    ...base,
    weight: (typeof base.weight === "number" ? base.weight : 2) + 2,
    opacity: 1,
  };
}

// Dimmed style — applied to non-selected siblings during a spotlight.
export function getTrailDimmedStyle(trail: Trail): PathOptions {
  const base = getTrailStyle(trail);
  return {
    ...base,
    opacity: 0.25,
  };
}
