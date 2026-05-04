/*
 * /szczyty/[slug] — full-page peak detail.
 *
 * Mirrors the SPA-style pattern set by /trasy/[slug] in PR 4: one static shell
 * is emitted at build time, and the actual peak data is fetched and resolved
 * client-side from `useParams()`. Cloudflare's static-asset SPA fallback
 * (`not_found_handling: "single-page-application"`, wired in PR #41) routes
 * arbitrary slugs to this shell at runtime.
 *
 * Why one shell instead of one page per peak:
 *   The peak roster is currently 24 entries and small enough to enumerate, but
 *   keeping the build shell static decouples deploys from API availability and
 *   matches how trips already work. If we ever want crawlable per-peak HTML,
 *   we can swap `generateStaticParams` to read the live manifest at build time
 *   without changing the route shape.
 */
import { PeakDetailRoute } from "./peak-detail-route";

// Single placeholder so Next emits exactly one shell HTML for the route.
// The slug value is never read server-side — see peak-detail-route.tsx.
export function generateStaticParams(): Array<{ slug: string }> {
  return [{ slug: "_" }];
}

export default function PeakDetailPage() {
  return <PeakDetailRoute />;
}
