/*
 * /trasy/[slug] — full-page trip detail.
 *
 * Per docs/design-proposal.md §7 mobile model, tapping a row in the logbook
 * navigates here on touch / narrow screens. The page is also linkable from
 * the desktop (share a route URL) — the in-place panel and this page render
 * the same TripDetailPanel underneath, so they stay in sync.
 *
 * Static export reality (CLAUDE.md: this app builds with output: 'export'):
 *   Next.js requires `generateStaticParams` for any dynamic route under
 *   static export. We pre-render a single placeholder shell at build time;
 *   the actual route data is hydrated client-side from the URL via
 *   `useParams()` inside `trip-detail-route.tsx`. This matches the "B" path
 *   called out in the PR brief — one static shell, SPA-style hydration —
 *   and avoids coupling deploys to API availability or to the rate at which
 *   new Strava routes land.
 *
 *   For arbitrary slugs to actually resolve to this shell, Cloudflare's
 *   static-asset SPA fallback (`not_found_handling: "single-page-application"`
 *   in wrangler config) needs to be wired at the deploy layer. Without it,
 *   only the placeholder slug below resolves directly. The in-place desktop
 *   panel still works regardless; PR 5 can revisit if a manifest snapshot
 *   ever feeds the build.
 */
import { TripDetailRoute } from "./trip-detail-route";

// Single placeholder so Next emits one shell HTML for the route. The slug
// value itself is never read server-side — the client child reads
// `useParams()` and resolves the trail from the live manifest.
export function generateStaticParams(): Array<{ slug: string }> {
  return [{ slug: "_" }];
}

// Unknown slugs at runtime should still serve this shell rather than the
// generic 404. `dynamicParams = true` (the default) is what enables that
// once the SPA fallback is in place.

export default function TripDetailPage() {
  return <TripDetailRoute />;
}
