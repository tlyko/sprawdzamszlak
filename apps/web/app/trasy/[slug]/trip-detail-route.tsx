/*
 * Client shell for /trasy/[slug].
 *
 * Reads the slug from the URL (useParams), fetches the manifest to find the
 * matching trail, then fetches that one trail's GeoJSON. Renders the same
 * TripDetailPanel that the desktop in-place expansion uses — no map slab on
 * this page (per §7 mobile spec: the trip is the surface, not the map).
 *
 * Why one-shot fetches and not the shared `useTripData` hook:
 *   `useTripData` fans out a request per trail to populate the map overlay.
 *   On this page we only render one trail, so loading 50 GeoJSONs to find
 *   the one we want would be wasteful (and the home page's map is not on
 *   screen here). Tight surface, single purpose.
 *
 * Errors are intentionally one-line, monospace, ink-3 — see proposal §9.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { TripDetailPanel } from "@/components/logbook/trip-detail-panel";
import {
  extractTripMeta,
  type TripMeta,
} from "@/components/logbook/extract-trip-meta";
import type { Trail, TrailGeoJson } from "@/components/map/types";

const API_URL_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  "https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod";

type LoadState =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error"; message: string }
  | { kind: "ready"; trail: Trail; meta: TripMeta | null };

export function TripDetailRoute() {
  const params = useParams<{ slug: string | string[] }>();
  // useParams returns either a string or string[] depending on whether the
  // route is catch-all. Ours is single-segment, so we narrow defensively.
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;

  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    if (!slug) {
      // Schedule the state flip on the next tick rather than synchronously —
      // the lint rule that flags sync setState in effects exists to prevent
      // cascading renders, and a queueMicrotask defers the update outside
      // React's commit phase. We still respect `cancelled` so a fast unmount
      // doesn't write stale state.
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
        const routesRes = await fetch(`${API_URL_BASE}/routes`);
        if (!routesRes.ok) {
          throw new Error(`routes: HTTP ${routesRes.status}`);
        }
        const trails: Trail[] = await routesRes.json();
        const trail = trails.find((t) => t.id === currentSlug);
        if (!trail) {
          if (!cancelled) setState({ kind: "not-found" });
          return;
        }
        // Fetch only this trail's GeoJSON. Failure here still renders the
        // panel (without elevation / stats) — matching the home-page tolerance.
        let meta: TripMeta | null = null;
        try {
          const geoRes = await fetch(trail.geojson_url);
          if (geoRes.ok) {
            const payload = (await geoRes.json()) as TrailGeoJson;
            meta = extractTripMeta(payload);
          }
        } catch (err) {
          console.error("[trasy] geojson fetch failed:", err);
        }
        if (!cancelled) setState({ kind: "ready", trail, meta });
      } catch (err) {
        console.error("[trasy] manifest fetch failed:", err);
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
        // Reserve room for header + footer like the home view does, so the
        // back link sits nicely above the fold on tall phones.
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
          Wczytuję trasę…
        </p>
      )}

      {state.kind === "not-found" && (
        <p className="px-5 py-8 font-mono text-sm text-ink-3">
          Nie znalazłem takiej trasy.
        </p>
      )}

      {state.kind === "error" && (
        <p className="px-5 py-8 font-mono text-sm text-danger">
          Błąd: {state.message}
        </p>
      )}

      {state.kind === "ready" && (
        <TripDetailPanel
          trail={state.trail}
          meta={state.meta}
          headingLevel={2}
        />
      )}
    </main>
  );
}
