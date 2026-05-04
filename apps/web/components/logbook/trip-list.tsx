/*
 * Trip list — the scrollable left column of the logbook.
 *
 * Renders trails grouped by year (sticky year separators on scroll) with a
 * type-filter pill row above the list. Issue #46 introduces both — see
 * `group-trails.ts` for the grouping logic and `filter-pills.tsx` for the
 * pill row.
 *
 * The list owns the filter state (a piece of UI ephemera, not a coordination
 * surface). Selection (`selectedTripId`) still lives in the page so it can
 * coordinate with the map. If a trail is selected externally (deep-link from
 * /korona-tatr or /statystyki, or a click on the map) and the active filter
 * would hide its row, we reset the filter to "all" so the row appears in
 * place — otherwise the click-to-fly behaviour breaks the user's mental
 * model ("I selected something and it disappeared").
 *
 * Empty / loading states are intentionally minimal: this is a single-user
 * site, an empty list means the API didn't respond, and a one-line note in
 * monospace is the right answer (see proposal §9 "no error illustrations").
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Peak, Trail, TrailGeoJson } from "@/components/map/types";
import { TripRow } from "./trip-row";
import { TripDetailPanel } from "./trip-detail-panel";
import { extractTripMeta } from "./extract-trip-meta";
import { FilterPills } from "./filter-pills";
import { findPeakByTrailName } from "./match-peak";
import {
  groupTrailsByYear,
  type LogbookFilter,
} from "./group-trails";

interface TripListProps {
  trails: Trail[];
  // PR 4: per-trail GeoJSON, index-aligned with `trails`. Used by the inline
  // detail panel to read distance / elevation / coords. Optional for callers
  // that don't need the panel (none today, but keeps the contract loose).
  trailGeoData?: TrailGeoJson[];
  // Peaks roster — used to look up summit altitudes and surface them next to
  // the trail name when a trail is named after a single peak. Optional so the
  // contract doesn't break callers that don't have the roster handy.
  peaks?: Peak[];
  selectedTripId: string | null;
  onSelect: (trailId: string | null) => void;
  isLoading: boolean;
}

export function TripList({
  trails,
  trailGeoData,
  peaks,
  selectedTripId,
  onSelect,
  isLoading,
}: TripListProps) {
  const [filter, setFilter] = useState<LogbookFilter>("all");

  // Pre-compute trail-id → peak height once per (trails, peaks) change so
  // each row doesn't walk the peak list on render.
  const peakHeightByTrailId = useMemo(() => {
    if (!peaks || peaks.length === 0) return new Map<string, number>();
    const out = new Map<string, number>();
    for (const trail of trails) {
      const peak = findPeakByTrailName(trail, peaks);
      if (peak?.height != null) out.set(trail.id, peak.height);
    }
    return out;
  }, [trails, peaks]);

  // Per-type counts for the pill row — kept on the trails list (not
  // post-grouping) so they reflect "how many overall", not "how many
  // visible right now under the active filter".
  const counts = useMemo(() => {
    const out: Partial<Record<LogbookFilter, number>> = { all: trails.length };
    for (const t of trails) {
      out[t.type] = (out[t.type] ?? 0) + 1;
    }
    return out;
  }, [trails]);

  // Year-grouped, filter-applied list. Empty array while trails are still
  // loading — the "Wczytuję dziennik…" branch below handles that surface.
  const groups = useMemo(
    () => groupTrailsByYear(trails, trailGeoData ?? [], filter),
    [trails, trailGeoData, filter]
  );

  // If the externally-selected trail is filtered out, reset the filter so
  // the row reappears. Without this, deep-linking a trail (e.g. from
  // /korona-tatr or /statystyki) would silently disappear into the active
  // filter's gap. queueMicrotask to keep the setState off the lint's radar.
  useEffect(() => {
    if (!selectedTripId || filter === "all") return;
    const visible = groups.some((g) =>
      g.trails.some((t) => t.id === selectedTripId)
    );
    if (visible) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setFilter("all");
    });
    return () => {
      cancelled = true;
    };
  }, [selectedTripId, filter, groups]);

  // When selection changes from the map (a trail click), scroll the
  // corresponding list row into view. The data-trip-id attribute lives on
  // the wrapping <li> so the query finds it regardless of inner DOM changes.
  // Depends on `groups` so the scroll re-runs once a freshly-applied filter
  // reset (above) has rendered the row into the DOM.
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!selectedTripId || !containerRef.current) return;
    const row = containerRef.current.querySelector<HTMLLIElement>(
      `li[data-trip-id="${CSS.escape(selectedTripId)}"]`
    );
    if (row) {
      row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedTripId, groups]);

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

  const visibleCount = groups.reduce((n, g) => n + g.trails.length, 0);

  return (
    <section
      aria-label="Lista tras"
      className="flex h-full flex-col bg-surface-1"
    >
      {/* Column header: small caps, paper-style. The label is intentionally
          terse — the chrome already says what the site is. */}
      <header className="flex items-baseline justify-between gap-3 border-b border-hairline px-5 py-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
          dziennik
        </h2>
        <div className="flex items-baseline gap-3 font-mono text-[11px] tabular-nums text-ink-3">
          <span>{isLoading ? "…" : `${trails.length} tras`}</span>
          <span aria-hidden="true">·</span>
          <Link
            href="/statystyki/"
            className="uppercase tracking-[0.08em] hover:text-ink-1 transition-colors"
          >
            stats →
          </Link>
        </div>
      </header>

      <FilterPills active={filter} onChange={setFilter} counts={counts} />

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
        ) : visibleCount === 0 ? (
          <p className="px-5 py-6 font-mono text-sm text-ink-3">
            Nic w tym filtrze.
          </p>
        ) : (
          <ul role="list" className="flex flex-col">
            {groups.map((group) => (
              <YearGroupSection
                key={group.year ?? "no-date"}
                year={group.year}
                trails={group.trails}
                selectedTripId={selectedTripId}
                onSelect={onSelect}
                selectedMeta={selectedMeta}
                peakHeightByTrailId={peakHeightByTrailId}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

interface YearGroupSectionProps {
  year: number | null;
  trails: Trail[];
  selectedTripId: string | null;
  onSelect: (trailId: string | null) => void;
  selectedMeta: ReturnType<typeof extractTripMeta>;
  peakHeightByTrailId: ReadonlyMap<string, number>;
}

function YearGroupSection({
  year,
  trails,
  selectedTripId,
  onSelect,
  selectedMeta,
  peakHeightByTrailId,
}: YearGroupSectionProps) {
  return (
    <li>
      {/* Sticky year header. `top-0` pins to the scroll container; the bg
          is opaque so the row underneath doesn't bleed through. The
          z-index sits below the trip-detail panel's close button (z-10
          inside TripDetailPanel) but above the resting trip rows. */}
      <h3 className="sticky top-0 z-[1] border-y border-hairline bg-surface-1/95 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] tabular-nums text-ink-3 backdrop-blur-sm">
        {year ?? "bez daty"}
      </h3>
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
                  peakHeight={peakHeightByTrailId.get(trail.id) ?? null}
                />
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}
