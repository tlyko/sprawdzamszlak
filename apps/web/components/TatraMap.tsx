/*
 * TatraMap — legacy re-export of the map shell.
 *
 * Pre-PR-3 this was the public surface for the home page's map. PR 3 hoisted
 * the data fetch up to apps/web/app/page.tsx and the page now imports
 * MapShell directly (with peaks / trails / selectedTripId props), so this
 * file no longer has a live consumer in-tree. Kept around as a stable import
 * boundary in case external scripts / docs still reference it; the export
 * forwards to the new prop-driven MapShell.
 *
 * The implementation lives in components/map/* — see docs/design-proposal.md
 * §4 for the breakdown.
 */
"use client";

export { MapShell as default } from "./map/map-shell";
