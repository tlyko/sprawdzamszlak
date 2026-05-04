/*
 * /korona-tatr — auto-detected progress against the Wielka Korona Tatr.
 *
 * Computes everything client-side: reuses the logbook's `useTripData` hook to
 * pull the same peaks + trail GeoJSON the home page already fetches, then
 * runs haversine over every coordinate of every trail against each of the 14
 * WKT summits. ~14 × 17 × 2k ≈ 470k checks at full corpus, which finishes
 * during the same tick as the geojson fan-out.
 *
 * No server-side computation, no precomputed manifest, no per-peak detail
 * page (the issue explicitly defers "kiedy / którą trasą zaliczone" to a
 * follow-up). When/if the corpus grows past O(1k) trails, this is the place
 * to memoise the bagged set into localStorage or move the math to the API.
 */
"use client";

import Link from "next/link";
import { useMemo } from "react";

import { extractTripMeta } from "@/components/logbook/extract-trip-meta";
import { useTripData } from "@/components/logbook/use-trip-data";
import {
  computeWktStatus,
  WKT_PEAK_IDS,
  type WktPeakStatus,
} from "@/components/korona/wkt";
import type { TripCoordinate } from "@/components/map/types";

export default function KoronaTatrPage() {
  const { peaks, trailGeoData, isLoading } = useTripData();

  // Pull each trail's LineString coords up-front so the bagged scan reads
  // straight arrays. Trails with no usable geometry collapse to []; they
  // can't bag anything but keep the call shape uniform.
  const trailCoords: TripCoordinate[][] = useMemo(() => {
    return trailGeoData.map((geo) => {
      const meta = extractTripMeta(geo ?? null);
      return meta?.coordinates ?? [];
    });
  }, [trailGeoData]);

  const status = useMemo(
    () => computeWktStatus(peaks, trailCoords),
    [peaks, trailCoords]
  );

  const baggedCount = status.filter((s) => s.bagged).length;
  // Until the peaks fetch resolves, `status` is empty — show the goal of 14
  // rather than 0/0 which reads as "nothing here".
  const total = status.length || WKT_PEAK_IDS.length;

  return (
    <main
      className="mx-auto w-full max-w-[960px] flex-1 px-5 py-8"
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
          wielka korona tatr
        </p>
        <h1 className="font-serif text-[34px] leading-tight text-ink-1">
          {isLoading ? (
            <span className="text-ink-3">…</span>
          ) : (
            <>
              <span className="tabular-nums text-alt-summit">{baggedCount}</span>
              <span className="text-ink-2"> z </span>
              <span className="tabular-nums">{total}</span>
              <span className="text-ink-2"> zaliczonych</span>
            </>
          )}
        </h1>
        <p className="font-sans text-[15px] leading-relaxed text-ink-2">
          14 najwyższych szczytów Tatr. Zdobycie wykrywane automatycznie — punkt
          z trasy GPS w odległości ≤ 50 m od wierzchołka. Nie ma ręcznych
          „uznaję, że byłem”. Jak GPS nie zarejestrował, znaczy że nie ma.
        </p>
      </header>

      <ul
        role="list"
        className="grid grid-cols-1 gap-px border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3"
      >
        {(status.length > 0
          ? status
          : // Skeleton roster while loading — same shape, muted, no data.
            WKT_PEAK_IDS.map<WktPeakStatus>((id) => ({
              peak: {
                id,
                nazwa: "—",
                trudnosc: "",
              },
              bagged: false,
            }))
        ).map(({ peak, bagged }, idx) => {
          const cellClasses = bagged
            ? "bg-surface-1 hover:bg-surface-2 transition-colors"
            : "bg-surface-1";
          const inner = (
            <article
              className={`flex h-full flex-col gap-3 px-5 py-5 ${cellClasses}`}
              aria-label={`${peak.nazwa}${bagged ? ", zaliczony" : ", niezaliczony"}`}
            >
              <header className="flex items-start justify-between gap-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3 tabular-nums">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span
                  aria-hidden="true"
                  className={
                    bagged
                      ? "h-2.5 w-2.5 rounded-full bg-alt-summit shadow-[0_0_0_2px_var(--surface-1),0_0_0_3px_var(--alt-summit)]"
                      : "h-2.5 w-2.5 rounded-full border border-firn/40"
                  }
                />
              </header>

              <h2
                className={
                  bagged
                    ? "font-serif text-[20px] leading-tight text-ink-1"
                    : "font-serif text-[20px] leading-tight text-ink-3"
                }
              >
                {peak.nazwa}
              </h2>

              <dl className="mt-auto flex items-baseline justify-between gap-4 font-mono text-[12px] text-ink-2">
                <div className="flex items-baseline gap-1">
                  {peak.height !== undefined ? (
                    <>
                      <dt className="sr-only">wysokość</dt>
                      <dd className="font-serif text-[18px] tabular-nums text-ink-1">
                        {peak.height}
                      </dd>
                      <span className="text-[11px] text-ink-3">m</span>
                    </>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </div>
                <span
                  className={
                    bagged
                      ? "uppercase tracking-[0.08em] text-alt-summit"
                      : "uppercase tracking-[0.08em] text-ink-3"
                  }
                >
                  {bagged ? "zaliczony" : "—"}
                </span>
              </dl>
            </article>
          );

          return (
            <li key={peak.id} className="contents">
              {bagged ? (
                <Link
                  href={`/szczyty/${peak.id}/`}
                  className="block focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>

      <footer className="mt-8 border-t border-hairline pt-5 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
        Lista WKT — Gerlach, Łomnica, Lodowy, Durny, Wysoka, Kieżmarski,
        Kończysta, Baranie Rogi, Rysy, Krywań, Staroleśny, Ganek, Sławkowski,
        Pośrednia Grań.
      </footer>
    </main>
  );
}
