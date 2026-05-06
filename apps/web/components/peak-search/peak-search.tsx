/*
 * Peak search — typeahead over the peak roster (~320 entries post-OSM
 * import). Renders above the trip list. On result click, dispatches a
 * peak-focus request: the map flies to lat/lon at z14 and auto-opens the
 * marker popup (via the same mechanism as the /szczyty/[slug] "pokaż na
 * mapie" deep-link, see map-shell.tsx FlyToSelectedPeak).
 *
 * Matching:
 *  - Polish-aware case + accent fold so "lomnica" matches "Łomnica" and
 *    "rozanki" matches "Różanki". NFD strips combining marks (ó→o, ą→a);
 *    ł doesn't decompose, so it gets an explicit pass.
 *  - Substring (not prefix) — owners type fragments like "kozi" expecting
 *    "Kozi Wierch", "Kozia Turnia", "Koziniec".
 *  - Min 2 chars before opening the dropdown (single letter would surface
 *    too many rows on a 320-peak roster).
 *  - Hard cap 8 results — keeps the dropdown short, encourages refining.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Peak } from "@/components/map/types";
import { fold } from "./fold";

interface Props {
  peaks: Peak[];
  onSelectPeak: (peakId: string) => void;
}

const MAX_RESULTS = 8;
const MIN_CHARS = 2;

export function PeakSearch({ peaks, onSelectPeak }: Props) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = fold(query.trim());
    if (q.length < MIN_CHARS) return [];
    return peaks
      .filter((p) => fold(p.nazwa).includes(q))
      .slice(0, MAX_RESULTS);
  }, [peaks, query]);

  // Reset the highlight when the result set changes; otherwise the active
  // index can outrun the list and Enter would dispatch the wrong peak.
  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  // Close on outside click. mousedown not click, so it fires before focus
  // moves elsewhere and avoids a double-toggle when the user clicks the
  // search input itself.
  useEffect(() => {
    if (!isOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [isOpen]);

  const handleSelect = (id: string) => {
    onSelectPeak(id);
    setQuery("");
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const peak = results[activeIndex];
      if (peak) handleSelect(peak.id);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative border-b border-hairline px-5 py-3"
    >
      <label className="sr-only" htmlFor="peak-search">
        Wyszukaj szczyt
      </label>
      <input
        ref={inputRef}
        id="peak-search"
        type="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="wyszukaj szczyt…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (query.trim().length >= MIN_CHARS) setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-controls="peak-search-listbox"
        aria-expanded={isOpen && results.length > 0}
        aria-autocomplete="list"
        className="w-full bg-transparent font-mono text-[12px] uppercase tracking-[0.06em] text-ink-1 placeholder:text-ink-3 focus:outline-none"
      />
      {isOpen && results.length > 0 ? (
        <ul
          id="peak-search-listbox"
          role="listbox"
          className="absolute left-0 right-0 top-full z-[1000] mt-px max-h-[60vh] overflow-y-auto border-b border-hairline bg-surface-0 shadow-sm"
        >
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                // mousedown handler with preventDefault keeps the input
                // focused while the click registers — without it, the blur
                // closes the dropdown before onClick fires.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(p.id)}
                onMouseEnter={() => setActiveIndex(i)}
                className={
                  "flex w-full items-baseline justify-between gap-3 px-5 py-2 text-left transition-colors " +
                  (i === activeIndex ? "bg-surface-1" : "hover:bg-surface-1")
                }
              >
                <span className="font-serif text-[15px] text-ink-1">
                  {p.nazwa}
                </span>
                {p.height !== undefined ? (
                  <span className="font-mono text-[11px] tabular-nums text-ink-3">
                    {p.height} m
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
