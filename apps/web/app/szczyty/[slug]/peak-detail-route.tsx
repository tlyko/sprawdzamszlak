/*
 * Client shell for /szczyty/[slug].
 *
 * Reads the slug from the URL (useParams), fetches the peak roster from
 * `GET /` (which returns Peak[] including description_html, wiki_url and
 * climbing grade), and renders the matching peak as a real page — same
 * content as the in-map popup but with room for prose, links, and a hero
 * altitude.
 *
 * Mirrors the structure of trip-detail-route.tsx (PR 4) so future peak +
 * trip pages keep the same loading / error / not-found shape. Errors are
 * intentionally one-line, monospace, ink-3 (proposal §9 — no illustrations,
 * no try-again UI).
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import type { Peak } from "@/components/map/types";

const API_URL_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  "https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod";

type LoadState =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error"; message: string }
  | { kind: "ready"; peak: Peak };

export function PeakDetailRoute() {
  const params = useParams<{ slug: string | string[] }>();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;

  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    if (!slug) {
      // Same defer-via-microtask pattern as trip-detail-route — keep the
      // setState off React's commit phase to satisfy the lint rule, while
      // still respecting unmount.
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) setState({ kind: "not-found" });
      });
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    async function load(currentSlug: string) {
      try {
        const res = await fetch(`${API_URL_BASE}/`);
        if (!res.ok) {
          throw new Error(`peaks: HTTP ${res.status}`);
        }
        const peaks: Peak[] = await res.json();
        const peak = peaks.find((p) => p.id === currentSlug);
        if (!peak) {
          if (!cancelled) setState({ kind: "not-found" });
          return;
        }
        if (!cancelled) setState({ kind: "ready", peak });
      } catch (err) {
        console.error("[szczyty] peaks fetch failed:", err);
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "nieznany błąd",
          });
        }
      }
    }
    load(slug);
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <main
      className="mx-auto w-full max-w-[640px] flex-1"
      style={{
        minHeight: "calc(100vh - var(--header-h) - var(--footer-h))",
      }}
    >
      <nav className="px-5 pt-5">
        <Link
          href="/"
          className="font-mono text-[12px] uppercase tracking-[0.06em] text-ink-3 hover:text-ink-1 transition-colors"
        >
          ← dziennik
        </Link>
      </nav>

      {state.kind === "loading" && (
        <p className="px-5 py-8 font-mono text-sm text-ink-3">
          Wczytuję szczyt…
        </p>
      )}

      {state.kind === "not-found" && (
        <p className="px-5 py-8 font-mono text-sm text-ink-3">
          Nie znalazłem takiego szczytu.
        </p>
      )}

      {state.kind === "error" && (
        <p className="px-5 py-8 font-mono text-sm text-danger">
          Błąd: {state.message}
        </p>
      )}

      {state.kind === "ready" && <PeakDetail peak={state.peak} />}
    </main>
  );
}

/*
 * Visual layout mirrors the trip detail panel: serif title, mono stats row,
 * description prose. The altitude is the headline number (text-3xl) because
 * for a peak that's the primary fact the page has to communicate — the in-map
 * popup leaves it inline; here we let it breathe.
 */
function PeakDetail({ peak }: { peak: Peak }) {
  const hasCoords =
    peak.latitude !== undefined && peak.longitude !== undefined;

  return (
    <article
      className="flex flex-col gap-6 px-5 py-6"
      aria-label={`Szczegóły szczytu: ${peak.nazwa}`}
    >
      <header className="flex flex-col gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
          szczyt
        </p>
        <h1 className="font-serif text-[28px] leading-tight text-ink-1">
          {peak.nazwa}
        </h1>
      </header>

      {/* Stats row — altitude as the headline, difficulties below. Same shape
          as the trip detail panel's <dl> so the eye reads them as the same
          grammar of metadata. */}
      <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-3 font-mono text-sm text-ink-mono">
        {peak.height !== undefined && (
          <div className="flex flex-col gap-1">
            <dt className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
              wysokość
            </dt>
            <dd className="font-serif text-[31px] leading-none tabular-nums text-ink-1">
              {peak.height}{" "}
              <span className="font-mono text-base text-ink-2">m</span>
            </dd>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <dt className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
            trudność
          </dt>
          <dd className="text-ink-1">{peak.trudnosc}</dd>
        </div>
        {peak.trudnosc_wspinaczkowa ? (
          <div className="flex flex-col gap-1">
            <dt className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
              wspinaczka
            </dt>
            <dd className="text-ink-1">{peak.trudnosc_wspinaczkowa}</dd>
          </div>
        ) : null}
      </dl>

      {/*
       * Description — owner-curated HTML from the seed file. Rendering as HTML
       * is acceptable here because the data is not user-generated; if peaks
       * ever become user-submitted, this needs a sanitizer (see CLAUDE.md
       * "Walidacja inputu"). The .peak-description class scopes our prose
       * styles in globals.css so we don't bleed across the app.
       */}
      {peak.description_html ? (
        <div
          className="peak-description font-sans text-[15px] leading-relaxed text-ink-2"
          dangerouslySetInnerHTML={{ __html: peak.description_html }}
        />
      ) : null}

      {/* Coordinates as plain text — we skip a rendered map preview here on
          purpose: the home page already is a map, and a thumbnail would
          double the bundle for one peak page. Coords are mono and tabular
          so they read as data, not prose. */}
      {hasCoords ? (
        <p className="font-mono text-[12px] tabular-nums text-ink-3">
          {peak.latitude!.toFixed(5)}°N · {peak.longitude!.toFixed(5)}°E
        </p>
      ) : null}

      {/* Action row — same visual grammar as the trip detail panel footer. */}
      <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-4 text-sm text-ink-2">
        {peak.wiki_url ? (
          <a
            href={peak.wiki_url}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-[12px] uppercase tracking-[0.06em] hover:text-ink-1 transition-colors"
          >
            wikipedia ↗
          </a>
        ) : null}
        <Link
          href="/"
          className="font-mono text-[12px] uppercase tracking-[0.06em] hover:text-ink-1 transition-colors"
        >
          pokaż na mapie
        </Link>
      </footer>
    </article>
  );
}
