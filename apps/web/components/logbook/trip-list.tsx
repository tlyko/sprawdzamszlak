/*
 * Trip list — the scrollable left column of the logbook.
 *
 * Renders rows in reverse-chronological order. The manifest doesn't yet
 * carry a date (PR 4 + Strava work surface that), so the order is "as the
 * API returns them" — once `Trail.date` exists, the sort moves here.
 *
 * The list owns no state; selection lives in the page (a single
 * `selectedTripId`) and is passed down. This keeps the data flow obvious
 * for a solo dev returning after months — see CLAUDE.md "Solo dev mindset".
 *
 * Empty / loading states are intentionally minimal: this is a single-user
 * site, an empty list means the API didn't respond, and a one-line note in
 * monospace is the right answer (see proposal §9 "no error illustrations").
 */
"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Trail, TrailGeoJson } from "@/components/map/types";
import { TripRow } from "./trip-row";
import { TripDetailPanel } from "./trip-detail-panel";
import { extractTripMeta } from "./extract-trip-meta";

interface TripListProps {
  trails: Trail[];
  // PR 4: per-trail GeoJSON, index-aligned with `trails`. Used by the inline
  // detail panel to read distance / elevation / coords. Optional for callers
  // that don't need the panel (none today, but keeps the contract loose).
  trailGeoData?: TrailGeoJson[];
  selectedTripId: string | null;
  onSelect: (trailId: string | null) => void;
  isLoading: boolean;
}

export function TripList({
  trails,
  trailGeoData,
  selectedTripId,
  onSelect,
  isLoading,
}: TripListProps) {
  // When selection changes from the map (a trail click), scroll the
  // corresponding list row into view. The data-trip-id attribute lives on
  // the wrapping <li> so the query finds it regardless of inner DOM changes.
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!selectedTripId || !containerRef.current) return;
    const row = containerRef.current.querySelector<HTMLLIElement>(
      `li[data-trip-id="${CSS.escape(selectedTripId)}"]`
    );
    if (row) {
      row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedTripId]);

  // Cache parsed meta for the selected trip — extractTripMeta walks the
  // whole geometry, so re-running it on every render of the surrounding list
  // would be wasteful for a long polyline.
  const selectedMeta = useMemo(() => {
    if (!selectedTripId || !trailGeoData) return null;
    const index = trails.findIndex((t) => t.id === selectedTripId);
    if (index === -1) return null;
    const geo = trailGeoData[index];
    return extractTripMeta(geo ?? null);
  }, [selectedTripId, trailGeoData, trails]);

  return (
    <section
      aria-label="Lista tras"
      className="flex h-full flex-col bg-surface-1"
    >
      {/* Column header: small caps, paper-style. The label is intentionally
          terse — the chrome already says what the site is. */}
      <header className="flex items-baseline justify-between border-b border-hairline px-5 py-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
          dziennik
        </h2>
        <span className="font-mono text-[11px] tabular-nums text-ink-3">
          {isLoading ? "…" : `${trails.length} tras`}
        </span>
      </header>

      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-y-auto"
        // Subtle inner scroll affordance — keeps the list edge from butting
        // against the viewport without a visible scrollbar at rest.
      >
        {isLoading && trails.length === 0 ? (
          <p className="px-5 py-6 font-mono text-sm text-ink-3">
            Wczytuję dziennik…
          </p>
        ) : trails.length === 0 ? (
          <p className="px-5 py-6 font-mono text-sm text-ink-3">
            Pusto. Dziennik jeszcze niewypełniony.
          </p>
        ) : (
          <ul role="list" className="flex flex-col">
            {trails.map((trail) => {
              const isSelected = selectedTripId === trail.id;
              return (
                <li
                  key={trail.id}
                  data-trip-id={trail.id}
                  className={
                    isSelected
                      ? "border-y border-hairline bg-surface-2"
                      : undefined
                  }
                >
                  {isSelected ? (
                    /* In-place expansion per docs/design-proposal.md §7.
                       The row's compact header is replaced by the full panel;
                       the close button collapses the panel back. The map fly-
                       to + spotlight is owned by MapShell and triggered via
                       the same `selectedTripId` prop in app/page.tsx. */
                    <TripDetailPanel
                      trail={trail}
                      meta={selectedMeta}
                      onClose={() => onSelect(null)}
                    />
                  ) : (
                    <TripRow
                      trail={trail}
                      isSelected={false}
                      // Toggle: re-clicking the selected row deselects.
                      onSelect={(id) =>
                        onSelect(selectedTripId === id ? null : id)
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
