/*
 * /szczyty/[slug] — full-page peak detail.
 *
 * The actual peak data is fetched and resolved client-side from the URL —
 * see `peak-detail-route.tsx`. Server-side, every shell is the same content;
 * the slug only matters for routing.
 *
 * Why we enumerate every slug at build time (not just a placeholder):
 *   With `output: 'export'` + Next.js 16, the client app router only accepts
 *   URLs whose params are listed in `generateStaticParams`. If we ship just
 *   `[{ slug: '_' }]`, hitting `/szczyty/rysy/` directly hydrates as the root
 *   route (the home logbook) — confirmed live: the URL bar stays correct but
 *   the rendered tree is wrong, with no console errors. Listing every peak
 *   slug emits one static HTML per peak (same content) so Next has a route
 *   match for any direct URL the popup link can produce.
 *
 *   Build cost: one HTML + a small RSC payload per peak × ~320 peaks ≈ 5MB
 *   total, negligible at our scale. Build time stays under 5s. Re-emitting
 *   each peak is OK because the shell is static — no per-peak data is read
 *   at build time.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PeakDetailRoute } from './peak-detail-route';

interface PeakSeed {
  id: string;
}

// Read the catalog from `apps/api/seeds/peaks.json` (the same source the
// API loads from at first deploy). The path is relative to the workspace
// root, which is two levels above `apps/web/`.
function readPeakSlugs(): string[] {
  const seedPath = resolve(process.cwd(), '..', 'api', 'seeds', 'peaks.json');
  const raw = readFileSync(seedPath, 'utf-8');
  const parsed = JSON.parse(raw) as PeakSeed[];
  // De-duplicate defensively — the seed should already be unique by id, but
  // a duplicate here would crash the build with a routing collision.
  return [...new Set(parsed.map((p) => p.id))];
}

export function generateStaticParams(): Array<{ slug: string }> {
  // Keep the `_` placeholder around so the legacy shell copy
  // (apps/web/scripts/copy-spa-shells.mjs → /_shells/szczyty.html) still
  // has something to mirror — the shell stays as the safety net for any
  // future slug not yet in the catalog.
  return [{ slug: '_' }, ...readPeakSlugs().map((slug) => ({ slug }))];
}

export default function PeakDetailPage() {
  return <PeakDetailRoute />;
}
