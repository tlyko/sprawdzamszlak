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

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { TripDetailPanel } from "@/components/logbook/trip-detail-panel";
import {
  extractTripMeta,
  type TripMeta,
} from "@/components/logbook/extract-trip-meta";
import { useOgMeta } from "@/components/logbook/og-meta";
import type { Trail, TrailGeoJson } from "@/components/map/types";
import { API_BASE as API_URL_BASE } from "@/lib/api-base";

// See peak-detail-route for the same pattern: useParams() returns the
// build-time placeholder ('_') when the page is served via the
// /trasy/* → /_shells/trasy.html Cloudflare rewrite. Read the slug from
// window.location to get the real one.
function readSlugFromWindow(): string | null {
  if (typeof window === "undefined") return null;
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "trasy") return null;
  const slug = parts[1];
  if (!slug || slug === "_") return null;
  return slug;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error"; message: string }
  | { kind: "ready"; trail: Trail; meta: TripMeta | null };

export function TripDetailRoute() {
  const [slug, setSlug] = useState<string | null>(null);
  const [slugReady, setSlugReady] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  // Read slug post-mount from window.location (always defined in
  // "use client" components after hydration).
  useEffect(() => {
    setSlug(readSlugFromWindow());
    setSlugReady(true);
  }, []);

  useEffect(() => {
    if (!slugReady) return;
    if (!slug) {
      setState({ kind: "not-found" });
      return;
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
  }, [slug, slugReady]);

  // Build OG meta only when the trip is ready. The hook handles the
  // null-input case gracefully (no-op + no cleanup), so loading / error
  // states keep the layout's default tags.
  const ogInput = useMemo(
    () => (state.kind === "ready" ? buildOgInput(state.trail, state.meta) : null),
    [state]
  );
  useOgMeta(ogInput);

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

// Polish labels — kept inline so this file is self-contained for the OG
// description build. Mirrors trip-detail-panel.tsx and statystyki/page.tsx;
// extract to a shared module if a fourth caller appears.
const SPORT_TYPE_OG_LABEL: Record<string, string> = {
  Hike: "wędrówka",
  TrailRun: "bieg górski",
  Run: "bieg",
  Walk: "spacer",
  Ride: "rower",
  AlpineSki: "narty zjazdowe",
  BackcountrySki: "skitour",
  RockClimbing: "wspinaczka",
  Snowshoe: "rakiety śnieżne",
};

function buildOgInput(trail: Trail, meta: TripMeta | null) {
  const props = meta?.properties;
  const parts: string[] = [];

  if (props?.sport_type) {
    parts.push(SPORT_TYPE_OG_LABEL[props.sport_type] ?? props.sport_type.toLowerCase());
  }
  if (typeof props?.distance === "number" && props.distance > 0) {
    parts.push(`${(props.distance / 1000).toFixed(1).replace(".", ",")} km`);
  }
  if (
    typeof props?.total_elevation_gain === "number" &&
    props.total_elevation_gain > 0
  ) {
    const rounded = Math.round(props.total_elevation_gain / 5) * 5;
    parts.push(`${rounded} m przewyższenia`);
  }

  // Fallback when the manifest carries nothing — the title alone still beats
  // the layout default for share previews.
  const description =
    parts.length > 0 ? parts.join(" • ") : "Trasa w kronice tatrzańskiej.";

  // Anchor on origin so the URL is canonical regardless of where the user
  // currently is. Falls back to the slug-relative path on the (rare) SSR
  // pre-pass before the hook is allowed to mutate document.head.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return {
    title: trail.name,
    description,
    url: `${origin}/trasy/${trail.id}/`,
  };
}
