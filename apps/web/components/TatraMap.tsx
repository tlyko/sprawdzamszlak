/*
 * TatraMap — public surface for the home page's map.
 *
 * As of PR 2 ("cartographic-pass") the implementation is split across
 * components/map/* — see docs/design-proposal.md §4 for the breakdown:
 *   - tile-layer.tsx       Stadia Outdoors + OSM fallback
 *   - peak-markers.tsx     Altitude-tiered DivIcons (summit / high / mid / low)
 *   - peak-tier.ts         Tier classifier + visibility config
 *   - trail-overlay.tsx    Per-trail GeoJSON with hover + spotlight states
 *   - trail-style.ts       Per-type colour/weight/dash mapping
 *   - map-shell.tsx        MapContainer, data fetch, orchestration
 *   - types.ts             Peak / Trail interfaces
 *
 * This file is kept as the import target so PR 1's app/page.tsx (which dynamic-
 * imports `@/components/TatraMap`) keeps working without any consumer change.
 * If a future PR moves the data fetch up to the page (PR 3 will), TatraMap
 * stays the import boundary and just forwards a richer set of props.
 */
"use client";

export { MapShell as default } from "./map/map-shell";
