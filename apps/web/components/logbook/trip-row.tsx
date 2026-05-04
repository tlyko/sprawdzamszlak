/*
 * Trip row — a single entry in the logbook list.
 *
 * V1 surface (PR 3): trail name + type pill. Date / distance / vertical land
 * in PR 4 once the GPX parser persists them on the manifest — until then the
 * row stays intentionally sparse, per docs/design-proposal.md §4 "Data shape":
 * "the redesign should not block on backend".
 *
 * Interaction:
 *  - Click selects this trip (handled by the parent list).
 *  - Selected rows draw on raised surface-2 with a hairline accent on the
 *    leading edge — echoes the spotlight on the map.
 *  - Focus ring uses the global :focus-visible rule (accent gold).
 *
 * a11y:
 *  - The row is a <button> so keyboard users get Enter/Space activation for
 *    free; aria-pressed communicates selection state to screen readers.
 */
"use client";

import type { Trail } from "@/components/map/types";
import { TypePill } from "./type-pill";

interface TripRowProps {
  trail: Trail;
  isSelected: boolean;
  onSelect: (trailId: string) => void;
  // Optional hover handler — the parent forwards this to a "preview" map
  // state once that lands. Not wired in PR 3 to keep the surface tight.
  onHover?: ((trailId: string | null) => void) | undefined;
}

export function TripRow({ trail, isSelected, onSelect, onHover }: TripRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(trail.id)}
      onMouseEnter={onHover ? () => onHover(trail.id) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      aria-pressed={isSelected}
      // Left-edge accent appears only when selected — communicates the
      // map spotlight without adding noise to resting rows.
      className={[
        "group relative w-full text-left",
        "px-5 py-4",
        "border-b border-hairline/60",
        "transition-colors duration-200",
        "hover:bg-surface-1",
        isSelected ? "bg-surface-2" : "bg-transparent",
      ].join(" ")}
    >
      {/* Selection rail on the leading edge. 2px wide, accent gold. */}
      <span
        aria-hidden="true"
        className={[
          "absolute left-0 top-0 h-full w-[2px]",
          "transition-opacity duration-200",
          isSelected ? "bg-accent opacity-100" : "opacity-0",
        ].join(" ")}
      />

      <div className="flex items-baseline gap-3">
        <h3
          className={[
            "font-serif text-[18px] leading-tight",
            isSelected ? "text-ink-1" : "text-ink-1 group-hover:text-ink-1",
          ].join(" ")}
        >
          {trail.name}
        </h3>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <TypePill type={trail.type} />
        {/* Placeholder slot for date/distance/vertical — surfaced by PR 4
            when the parser populates these fields on the manifest. */}
      </div>
    </button>
  );
}
