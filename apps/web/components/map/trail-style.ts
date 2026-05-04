/*
 * Per-trail-type style functions.
 *
 * Colour values are sourced from CSS custom properties defined in
 * app/globals.css (--alpine-sky, --rusalka, …). Leaflet sets stroke colours
 * imperatively via JS, not CSS, so we read the variable values at module
 * import time and cache them.
 *
 * Type → token mapping (no palette additions):
 *   official  → alpine-sky  solid     w3   (PTTK/TANAP marked trail)
 *   off-piste → rusalka     dashed    w2.5 (Tatra unmarked walking/scrambling)
 *   walk      → lichen      solid     w2.5 (Strava Walk — lowland/forest)
 *   ski-tour  → firn        dotted    w3   (Strava BackcountrySki/AlpineSki)
 *   climbing  → obsidian    solid     w3   (Strava RockClimbing — dark on light)
 *
 * Hover: weight +1, opacity 100%.
 * Selected (PR 3 plug-in): weight +2, opacity 100%, others dim to 25%.
 */
import type { PathOptions } from "leaflet";
import type { Trail, TrailType } from "./types";

function readToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

let palette: Record<TrailType, string> | null = null;
function getPalette(): Record<TrailType, string> {
  if (palette) return palette;
  palette = {
    official: readToken("--alpine-sky", "#6fa8c4"),
    "off-piste": readToken("--rusalka", "#c4744a"),
    walk: readToken("--lichen", "#8fa678"),
    "ski-tour": readToken("--firn", "#e8e2d2"),
    climbing: readToken("--obsidian", "#2a3340"),
  };
  return palette;
}

// Base style — "resting" state of the trail.
export function getTrailStyle(trail: Trail): PathOptions {
  const colors = getPalette();
  switch (trail.type) {
    case "official":
      return { color: colors.official, weight: 3, opacity: 0.85 };
    case "off-piste":
      return { color: colors["off-piste"], weight: 2.5, opacity: 0.9, dashArray: "6 8" };
    case "walk":
      return { color: colors.walk, weight: 2.5, opacity: 0.85 };
    case "ski-tour":
      return { color: colors["ski-tour"], weight: 3, opacity: 0.95, dashArray: "2 5" };
    case "climbing":
      return { color: colors.climbing, weight: 3, opacity: 0.9 };
    default:
      // Belt-and-braces — RouteSchema validation should keep `type` inside
      // the enum, but if a future migration introduces a new value before
      // this switch is updated, render a muted ink-3 hairline instead of
      // dropping the polyline.
      return { color: readToken("--ink-3", "#6e7480"), weight: 2, opacity: 0.7 };
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
