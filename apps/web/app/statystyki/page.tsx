/*
 * /statystyki — "rok w liczbach", per-year aggregates over the trip manifest.
 *
 * Frontend-only. Reuses `useTripData` to pull the same manifest the home
 * page already fetches, then calls `extractTripMeta` per trail to expose the
 * `properties.distance` / `total_elevation_gain` / `sport_type` / `name`
 * fields the Strava fetcher writes into each Feature. Aggregation lives in
 * `components/statystyki/aggregate.ts`.
 *
 * Out of scope per issue #45: charts, calendar heatmap, year-over-year
 * comparison. The single-control UI is a year-pill row at the top — switching
 * year recomputes the panel locally; nothing fetched, nothing routed.
 */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { extractTripMeta } from "@/components/logbook/extract-trip-meta";
import { useTripData } from "@/components/logbook/use-trip-data";
import {
  computeYearStats,
  listYears,
  type TripEntry,
  type TripHighlight,
} from "@/components/statystyki/aggregate";

// Polish labels for the Strava sport_type values our fetcher accepts. Kept
// in sync with the same map in trip-detail-panel.tsx — duplicated rather
// than extracted: two callers, both small. Lift when a third arrives.
const SPORT_TYPE_LABEL: Record<string, string> = {
  Hike: "wędrówki",
  TrailRun: "biegi górskie",
  Run: "biegi",
  Walk: "spacery",
  Ride: "rower",
  AlpineSki: "narty zjazdowe",
  BackcountrySki: "skitour",
  RockClimbing: "wspinaczki",
  Snowshoe: "rakiety",
};

export default function StatystykiPage() {
  const { trails, trailGeoData, isLoading } = useTripData();

  // Build {trail, meta} pairs, dropping rows with no parseable LineString —
  // those can't contribute to any aggregate. Trail/meta indices are aligned
  // with `trails` upstream, so we zip them here.
  const trips: TripEntry[] = useMemo(() => {
    const out: TripEntry[] = [];
    for (let i = 0; i < trails.length; i++) {
      const meta = extractTripMeta(trailGeoData[i] ?? null);
      if (!meta) continue;
      out.push({ trail: trails[i]!, meta });
    }
    return out;
  }, [trails, trailGeoData]);

  const yearsAvailable = useMemo(() => listYears(trips), [trips]);

  const currentYear = new Date().getFullYear();
  // Default selection: current year if it has data, otherwise the most
  // recent year that does. Falls back to the current year for the empty
  // state (renders zeroes + "jeszcze nic w tym roku").
  const defaultYear =
    yearsAvailable.includes(currentYear)
      ? currentYear
      : yearsAvailable[0] ?? currentYear;
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const year = selectedYear ?? defaultYear;

  const stats = useMemo(() => computeYearStats(trips, year), [trips, year]);

  return (
    <main
      className="mx-auto w-full max-w-[640px] grow shrink-0 px-5 py-8"
      style={{ minHeight: "calc(100vh - var(--header-h) - var(--footer-h))" }}
    >
      <nav className="mb-6">
        <Link
          href="/"
          className="font-mono text-[12px] uppercase tracking-[0.06em] text-ink-3 hover:text-ink-1 transition-colors"
        >
          ← dziennik
        </Link>
      </nav>

      <header className="mb-8 flex flex-col gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
          rok w liczbach
        </p>
        <h1 className="font-serif text-[34px] leading-tight text-ink-1 tabular-nums">
          {year}
        </h1>
      </header>

      {/* Year pills — only render when we have ≥ 2 years on record. With one
          year, the headline already says everything. */}
      {yearsAvailable.length > 1 ? (
        <div
          role="tablist"
          aria-label="Wybierz rok"
          className="mb-8 flex flex-wrap gap-2"
        >
          {yearsAvailable.map((y) => {
            const active = y === year;
            return (
              <button
                key={y}
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedYear(y)}
                className={
                  active
                    ? "rounded-full border border-ink-1 bg-ink-1 px-3 py-1 font-mono text-[12px] tabular-nums text-surface-0"
                    : "rounded-full border border-hairline px-3 py-1 font-mono text-[12px] tabular-nums text-ink-2 hover:border-ink-2 hover:text-ink-1 transition-colors"
                }
              >
                {y}
              </button>
            );
          })}
        </div>
      ) : null}

      {isLoading && trips.length === 0 ? (
        <p className="font-mono text-sm text-ink-3">Wczytuję dziennik…</p>
      ) : stats.count === 0 ? (
        <p className="font-sans text-[15px] leading-relaxed text-ink-2">
          Jeszcze nic w {year} roku — albo Strava jeszcze nie zsynchronizowała,
          albo faktycznie pusto.
        </p>
      ) : (
        <Stats stats={stats} />
      )}
    </main>
  );
}

function Stats({
  stats,
}: {
  stats: ReturnType<typeof computeYearStats>;
}) {
  return (
    <div className="flex flex-col gap-10">
      {/* Headline triple — count, distance, elevation. Big serif numbers, mono
          units. Same grammar as the trip detail panel (PR 4) so the eye reads
          them as one family. */}
      <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Stat label="aktywności" value={stats.count.toString()} unit="" />
        <Stat
          label="dystansu"
          value={formatKm(stats.distanceM)}
          unit="km"
        />
        <Stat
          label="podejść"
          value={formatThousands(stats.elevationM)}
          unit="m"
        />
      </dl>

      {Object.keys(stats.sportTypeCounts).length > 0 ? (
        <section aria-label="Po typach">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
            po typach
          </h2>
          <ul role="list" className="flex flex-col">
            {sortSportTypes(stats.sportTypeCounts).map(([sport, count]) => (
              <li
                key={sport}
                className="flex items-baseline justify-between gap-4 border-b border-hairline py-2 text-[15px] last:border-b-0"
              >
                <span className="font-sans text-ink-1">
                  {SPORT_TYPE_LABEL[sport] ?? sport.toLowerCase()}
                </span>
                <span className="font-mono tabular-nums text-ink-2">
                  {count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        {stats.longest ? (
          <Highlight
            label="najdłuższa"
            highlight={stats.longest}
            unit="km"
            format={(m) => formatKm(m)}
          />
        ) : null}
        {stats.highestClimb ? (
          <Highlight
            label="największe podejście"
            highlight={stats.highestClimb}
            unit="m"
            format={(m) => formatThousands(m)}
          />
        ) : null}
      </div>

      <p className="border-t border-hairline pt-5 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
        Liczone z aktywności zsynchronizowanych ze Stravy. Manualne wpisy bez
        dystansu / przewyższenia są w licznikach pominięte.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
        {label}
      </dt>
      <dd className="flex items-baseline gap-1.5">
        <span className="font-serif text-[31px] leading-none tabular-nums text-ink-1">
          {value}
        </span>
        {unit ? (
          <span className="font-mono text-[13px] text-ink-2">{unit}</span>
        ) : null}
      </dd>
    </div>
  );
}

function Highlight({
  label,
  highlight,
  unit,
  format,
}: {
  label: string;
  highlight: TripHighlight;
  unit: string;
  format: (n: number) => string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
        {label}
      </p>
      <Link
        href={`/?trip=${encodeURIComponent(highlight.trailId)}`}
        className="font-serif text-[20px] leading-tight text-ink-1 hover:text-accent transition-colors"
      >
        {highlight.name}
      </Link>
      <p className="font-mono text-[13px] tabular-nums text-ink-2">
        {format(highlight.value)} {unit}
      </p>
    </div>
  );
}

// Sorted descending by count, then alphabetically by raw sport type so order
// is stable across refreshes when two types tie.
function sortSportTypes(
  counts: Record<string, number>
): Array<[string, number]> {
  return Object.entries(counts).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
}

// 12345 m → "12,3" (PL locale, one decimal).
function formatKm(m: number): string {
  const km = m / 1000;
  return km.toLocaleString("pl-PL", {
    minimumFractionDigits: km < 100 ? 1 : 0,
    maximumFractionDigits: km < 100 ? 1 : 0,
  });
}

// 18600 → "18 600" (PL locale uses NBSP as thousands separator).
function formatThousands(n: number): string {
  return Math.round(n).toLocaleString("pl-PL");
}
