/*
 * Logbook home — Direction B, PR 3 (docs/design-proposal.md §8 PR 3).
 *
 * Layout (single map instance, responsive container):
 *  - Desktop (md+): horizontal row. Trip list = 420px on the left, persistent
 *    map fills the rest.
 *  - Mobile: vertical column. 40vh map slab on top, scrollable list below as
 *    the primary surface. Same map component, different container size — no
 *    duplication, no re-mount on resize.
 *
 * Selecting a list row flies the map to the trail's bounds and spotlights
 * it; clicking the spotlit row again deselects. Clicking a trail directly on
 * the map syncs the list back via the same setter.
 *
 * Mobile interaction call: in-place fly-to (NOT navigate to /trasy/[slug]).
 * Why: PR 4 lands the actual /trasy/[slug] page; shipping a click handler
 * that 404s today would be a regression. The in-place model also keeps the
 * map persistently visible — true to the "mapa-jako-spine" thesis. When PR 4
 * adds the detail route, mobile rows can switch to navigation.
 *
 * State:
 *  - Single `selectedTripId` lives here, passed to both the list (for
 *    highlighting + scroll-into-view) and the map (for spotlight + fly-to).
 *  - No global store, no context — too much for one piece of state.
 */
"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { TripList } from "@/components/logbook/trip-list";
import { useTripData } from "@/components/logbook/use-trip-data";
import type { MapShellProps } from "@/components/map/map-shell";

// Hoisted to module scope so the dynamic component reference is stable
// across renders (otherwise the map would re-mount on every state change
// and lose its zoom/centre). Module scope also satisfies the
// react-hooks/static-components lint rule.
const Map = dynamic<MapShellProps>(
  () => import("@/components/map/map-shell").then((mod) => mod.MapShell),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-surface-0 text-ink-2">
        <p className="font-mono text-sm">Wczytuję mapę…</p>
      </div>
    ),
  }
);

export default function Home() {
  const { peaks, trails, trailGeoData, isLoading } = useTripData();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  return (
    <main
      // Mobile: column. Desktop: row with the list pinned to a 420px column
      // on the left. The fixed page height (viewport minus chrome) means the
      // list and map can scroll independently — neither propagates to the
      // page scroll, which would feel wrong with a persistent map.
      className="flex min-h-0 flex-1 flex-col md:flex-row"
      style={{
        height: "calc(100vh - var(--header-h) - var(--footer-h))",
      }}
    >
      {/* Map. Mobile slab pinned to top (40vh); on desktop it expands to
          fill the remainder of the row to the right of the list. The order-2
          on mobile keeps the list as the primary surface in source order
          (a11y), with CSS placing the map on top via order-1 below md. */}
      <section
        aria-label="Mapa Tatr"
        className="relative w-full shrink-0 border-b border-hairline order-1 h-[40vh] md:order-2 md:h-full md:flex-1 md:border-b-0 md:border-l md:border-hairline"
      >
        <Map
          peaks={peaks}
          trails={trails}
          trailGeoData={trailGeoData}
          selectedTripId={selectedTripId}
          onTripSelect={setSelectedTripId}
        />
      </section>

      {/* Trip list — primary surface on mobile, fixed-width left column
          on desktop. min-h-0 + flex-1 lets the inner ul scroll without
          pushing the layout. */}
      <div className="order-2 min-h-0 flex-1 md:order-1 md:h-full md:w-[420px] md:flex-none">
        <TripList
          trails={trails}
          selectedTripId={selectedTripId}
          onSelect={setSelectedTripId}
          isLoading={isLoading}
        />
      </div>
    </main>
  );
}
