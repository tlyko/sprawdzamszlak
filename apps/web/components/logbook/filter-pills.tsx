/*
 * Filter pill row above the trip list. Single-select — clicking a pill sets
 * it active, clicking the active pill (or "wszystkie") resets to all.
 *
 * Labels match `TypePill` exactly so the eye doesn't have to translate
 * between row chips and the filter row. The row scrolls horizontally on
 * narrow viewports rather than wrapping — keeps the list area below
 * predictable height-wise on mobile.
 */
"use client";

import type { LogbookFilter } from "./group-trails";

const PILLS: ReadonlyArray<{ value: LogbookFilter; label: string }> = [
  { value: "all", label: "wszystkie" },
  { value: "official", label: "oficjalny" },
  { value: "off-piste", label: "pozaszlak" },
  { value: "walk", label: "spacer" },
  { value: "ski-tour", label: "skitur" },
  { value: "climbing", label: "wspinaczka" },
];

interface FilterPillsProps {
  active: LogbookFilter;
  onChange: (next: LogbookFilter) => void;
  // Per-type counts (how many trails match each filter). Optional — the row
  // renders without them when the manifest hasn't loaded yet.
  counts?: Partial<Record<LogbookFilter, number>>;
}

export function FilterPills({ active, onChange, counts }: FilterPillsProps) {
  return (
    <div
      role="tablist"
      aria-label="Filtruj po typie"
      className="flex gap-1.5 overflow-x-auto border-b border-hairline px-5 py-3"
    >
      {PILLS.map(({ value, label }) => {
        const isActive = active === value;
        const count = counts?.[value];
        // Hide pills with zero matches (except "all" which always shows the
        // total) — keeps the row terse when the corpus has only one or two
        // trail types represented. `undefined` count = the type isn't in
        // the manifest at all, treated the same as zero.
        if (value !== "all" && !count) return null;
        return (
          <button
            key={value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(isActive ? "all" : value)}
            className={
              isActive
                ? "shrink-0 rounded-full border border-ink-1 bg-ink-1 px-2.5 py-[3px] font-mono text-[11px] uppercase tracking-[0.06em] text-surface-0 transition-colors"
                : "shrink-0 rounded-full border border-hairline px-2.5 py-[3px] font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2 hover:border-ink-2 hover:text-ink-1 transition-colors"
            }
          >
            <span>{label}</span>
            {count !== undefined ? (
              <span
                className={
                  isActive
                    ? "ml-1.5 tabular-nums text-surface-0/70"
                    : "ml-1.5 tabular-nums text-ink-3"
                }
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
