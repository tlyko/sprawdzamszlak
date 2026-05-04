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

import { useEffect, useRef } from "react";
import type { Trail } from "@/components/map/types";
import { TripRow } from "./trip-row";

interface TripListProps {
  trails: Trail[];
  selectedTripId: string | null;
  onSelect: (trailId: string | null) => void;
  isLoading: boolean;
}

export function TripList({
  trails,
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
            {trails.map((trail) => (
              <li key={trail.id} data-trip-id={trail.id}>
                <TripRow
                  trail={trail}
                  isSelected={selectedTripId === trail.id}
                  // Toggle: re-clicking the selected row deselects.
                  onSelect={(id) =>
                    onSelect(selectedTripId === id ? null : id)
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
