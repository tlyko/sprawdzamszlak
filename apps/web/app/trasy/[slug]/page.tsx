/*
 * /trasy/[slug] — full-page trip detail.
 *
 * Per docs/design-proposal.md §7 mobile model, tapping a row in the logbook
 * navigates here on touch / narrow screens. The page is also linkable from
 * the desktop (share a route URL) — the in-place panel and this page render
 * the same TripDetailPanel underneath, so they stay in sync.
 *
 * Build-time slug enumeration:
 *   With `output: 'export'` + Next.js 16, the client app router only accepts
 *   URLs whose params are listed in `generateStaticParams`. Visiting a non-
 *   listed slug (e.g. /trasy/strava-12345/) directly hydrates the home route
 *   instead of this one — observed live, no console errors.
 *
 *   So at build time we fetch `/api/routes` from production and emit a
 *   shell per known trail slug. Build-to-deploy lag means a brand-new
 *   Strava import isn't directly URL-able for ~minutes (until the next
 *   deploy); deep-links from the running app still work because the home
 *   tree drives the in-place panel without per-slug hydration.
 *
 *   If the fetch fails (offline build, dev-machine without network) we
 *   fall back to the `_` placeholder only — build still succeeds, the
 *   shell still copies to /_shells/trasy.html for the legacy SPA fallback.
 */
import { TripDetailRoute } from './trip-detail-route';

// Fetch the live trail manifest at build time. Same endpoint the home page
// calls at runtime; no auth needed. Time out fast so an unavailable upstream
// doesn't gate the build for minutes.
async function fetchKnownSlugs(): Promise<string[]> {
  const ROUTES_URL = 'https://sprawdzamszlak.pl/api/routes';
  try {
    const resp = await fetch(ROUTES_URL, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      console.warn(
        `[trasy/[slug]] /api/routes returned HTTP ${resp.status}; falling back to placeholder only`,
      );
      return [];
    }
    const data = (await resp.json()) as Array<{ id?: string }>;
    return data
      .map((r) => r.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch (err) {
    console.warn(
      '[trasy/[slug]] /api/routes fetch failed at build time; falling back to placeholder only',
      err,
    );
    return [];
  }
}

export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  const slugs = await fetchKnownSlugs();
  // Keep the `_` placeholder so apps/web/scripts/copy-spa-shells.mjs has a
  // canonical shell to mirror to /_shells/trasy.html — that fallback covers
  // any new Strava import that lands between deploys.
  return [{ slug: '_' }, ...slugs.map((slug) => ({ slug }))];
}

export default function TripDetailPage() {
  return <TripDetailRoute />;
}
