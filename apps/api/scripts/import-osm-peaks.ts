// Import all named Tatra peaks from OpenStreetMap (filtered to peaks
// notable enough to have a Wikipedia article) and merge into
// apps/api/seeds/peaks.json.
//
// Why: ADR-008's planner UX wants the owner to tick "yes I want this
// one this season" against ALL Tatra peaks, not just the ~24 the
// owner has manually curated. OSM has the comprehensive list keyed
// on `natural=peak`; filtering to peaks with `wikipedia=*` keeps it
// to canonical/notable summits (~150 in the Tatra bbox).
//
// Usage:
//   corepack pnpm -F api tsx scripts/import-osm-peaks.ts            # dry-run, prints diff
//   corepack pnpm -F api tsx scripts/import-osm-peaks.ts --write    # overwrites seeds/peaks.json
//
// Owner-curated fields (`trudnosc`, `trudnosc_wspinaczkowa`,
// `description_html`) on the existing 24 peaks are preserved on
// merge — only lat/lng/height/wiki_url get refreshed from OSM.
//
// Re-runs are safe: matching is by slug (id), so a second import with
// no DB changes is a no-op. New OSM peaks not yet in the file are
// appended; peaks dropped from OSM (very rare, e.g. retag) are NOT
// removed — owner deletes manually if they want.
//
// Requires node 22+ (built-in fetch).

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SEEDS_PATH = resolve(here, '../seeds/peaks.json');

// Approximate Tatra bbox (S, W, N, E).
const BBOX = '49.10,19.83,49.30,20.30';

// Wikipedia-tagged peaks under this elevation are usually ridge bumps,
// rocks named after a feature, or secondary points. 1800m keeps the
// canonical Tatra summits (~200 in High + Western combined) and drops
// the long tail. Owner can tweak by editing this constant and re-running.
const MIN_ELEVATION_M = 1800;

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:30];
(
  node["natural"="peak"](${BBOX});
);
out body;
`.trim();

interface OsmNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OsmNode[];
}

interface ExistingPeak {
  id: string;
  nazwa: string;
  trudnosc?: string;
  trudnosc_wspinaczkowa?: string;
  latitude: number;
  longitude: number;
  height?: number;
  description_html?: string;
  wiki_url?: string;
}

// ---------------------------------------------------------------------------
// Slugify — Polish + Slovak diacritics → ASCII, lowercase, underscore-separated.
// Matches the pattern of the manually-curated ids in the existing seed file
// (e.g. "lodowy_szczyt", "kiezmarski_szczyt").
// ---------------------------------------------------------------------------
function slugify(name: string): string {
  return name
    .toLowerCase()
    // ł / ż / ź don't decompose under NFD — handle explicitly.
    .replace(/ł/g, 'l')
    .replace(/ż/g, 'z')
    .replace(/ź/g, 'z')
    // Strip remaining diacritics via canonical decomposition.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Anything that's not [a-z0-9] becomes underscore; collapse runs.
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    // PeakIdSchema in @sprawdzamszlak/shared caps id at 64 chars.
    .slice(0, 64);
}

function buildWikiUrl(tag: string | undefined): string | undefined {
  if (!tag) return undefined;
  // OSM `wikipedia` tag format: `<lang>:<Article Title>`, e.g. "pl:Rysy".
  const match = /^([a-z]{2,3}):(.+)$/.exec(tag);
  if (!match) return undefined;
  const lang = match[1]!;
  const article = match[2]!;
  // Wikipedia URL-encodes spaces as underscores.
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(article.replace(/ /g, '_'))}`;
}

function pickName(tags: Record<string, string>): string | undefined {
  // Prefer Polish name (UI is Polish), then Slovak (cross-border peaks),
  // then the default `name` tag. Trim and collapse whitespace.
  const candidates = [tags['name:pl'], tags['name:sk'], tags['name']];
  for (const c of candidates) {
    if (c && c.trim().length > 0) return c.trim().replace(/\s+/g, ' ');
  }
  return undefined;
}

function pickHeight(tags: Record<string, string>): number | undefined {
  // OSM `ele` is meters as string, sometimes "2503", sometimes "2503.0",
  // sometimes "2503 m", sometimes "2,503". Be tolerant.
  const raw = tags['ele'];
  if (!raw) return undefined;
  const cleaned = raw.replace(/,/g, '').replace(/[^\d.]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 500 || n > 3000) return undefined;
  return Math.round(n);
}

// ---------------------------------------------------------------------------
// Fetch OSM peaks
// ---------------------------------------------------------------------------
async function fetchOsmPeaks(): Promise<OsmNode[]> {
  const body = new URLSearchParams({ data: OVERPASS_QUERY });
  const resp = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      // Overpass mirrors throttle by client identity; an honest UA helps
      // avoid 406/429 vs the unidentified-curl bucket.
      'User-Agent':
        'sprawdzamszlak-osm-peaks-import/1.0 (https://github.com/tlyko/sprawdzamszlak)',
    },
    body,
  });
  if (!resp.ok) {
    throw new Error(`Overpass returned HTTP ${resp.status}: ${await resp.text()}`);
  }
  const data = (await resp.json()) as OverpassResponse;
  return data.elements.filter((e) => e.type === 'node');
}

// ---------------------------------------------------------------------------
// Build catalog from OSM nodes — applies all filters and shape transforms.
// ---------------------------------------------------------------------------
interface CatalogPeak {
  id: string;
  nazwa: string;
  latitude: number;
  longitude: number;
  height?: number;
  wiki_url?: string;
}

function buildCatalog(nodes: OsmNode[]): CatalogPeak[] {
  const out: CatalogPeak[] = [];
  const seenIds = new Set<string>();
  let droppedNoWiki = 0;
  let droppedNoName = 0;
  let droppedNoEle = 0;
  let droppedTooLow = 0;
  let droppedDupSlug = 0;

  for (const node of nodes) {
    const tags = node.tags ?? {};
    const wikiTag = tags['wikipedia'];
    const wikidataTag = tags['wikidata'];
    // Notability filter: must have either wikipedia or wikidata tag.
    if (!wikiTag && !wikidataTag) {
      droppedNoWiki++;
      continue;
    }

    const name = pickName(tags);
    if (!name) {
      droppedNoName++;
      continue;
    }

    const height = pickHeight(tags);
    if (height === undefined) {
      // No elevation = probably mis-tagged or off-map; skip.
      droppedNoEle++;
      continue;
    }
    if (height < MIN_ELEVATION_M) {
      droppedTooLow++;
      continue;
    }

    const id = slugify(name);
    if (!id || id.length < 2) {
      droppedNoName++;
      continue;
    }
    if (seenIds.has(id)) {
      // Two OSM nodes slugged to the same id — keep the higher-elevation one.
      droppedDupSlug++;
      const existingIdx = out.findIndex((p) => p.id === id);
      if (existingIdx >= 0) {
        const existing = out[existingIdx]!;
        if ((existing.height ?? 0) < height) {
          out[existingIdx] = {
            id,
            nazwa: name,
            latitude: node.lat,
            longitude: node.lon,
            height,
            ...(buildWikiUrl(wikiTag) ? { wiki_url: buildWikiUrl(wikiTag)! } : {}),
          };
        }
      }
      continue;
    }
    seenIds.add(id);

    out.push({
      id,
      nazwa: name,
      latitude: node.lat,
      longitude: node.lon,
      height,
      ...(buildWikiUrl(wikiTag) ? { wiki_url: buildWikiUrl(wikiTag)! } : {}),
    });
  }

  console.log(
    `OSM nodes: ${nodes.length}; kept: ${out.length}; dropped: noWiki=${droppedNoWiki}, noName=${droppedNoName}, noEle=${droppedNoEle}, tooLow=${droppedTooLow}, dupSlug=${droppedDupSlug}`,
  );
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Merge with existing seed — preserves owner-curated fields.
// ---------------------------------------------------------------------------
function mergeWithExisting(
  catalog: CatalogPeak[],
  existing: ExistingPeak[],
): { merged: ExistingPeak[]; added: number; updated: number; preservedOnly: number } {
  const byId = new Map<string, ExistingPeak>(existing.map((p) => [p.id, p]));
  let added = 0;
  let updated = 0;
  let preservedOnly = 0;

  // First: every catalog peak goes in. If it matches an existing id, keep the
  // owner-curated fields (trudnosc, trudnosc_wspinaczkowa, description_html)
  // and refresh the OSM-derived ones (lat/lng/height/wiki_url).
  for (const cp of catalog) {
    const prior = byId.get(cp.id);
    if (prior) {
      const next: ExistingPeak = {
        id: cp.id,
        // Keep owner's preferred display name (often bilingual,
        // e.g. "Gerlach (Gerlachovský štít)") — OSM has just one.
        nazwa: prior.nazwa,
        ...(prior.trudnosc !== undefined ? { trudnosc: prior.trudnosc } : {}),
        ...(prior.trudnosc_wspinaczkowa !== undefined
          ? { trudnosc_wspinaczkowa: prior.trudnosc_wspinaczkowa }
          : {}),
        latitude: cp.latitude,
        longitude: cp.longitude,
        ...(cp.height !== undefined ? { height: cp.height } : {}),
        ...(prior.description_html !== undefined
          ? { description_html: prior.description_html }
          : {}),
        // Owner's wiki_url wins if they set one (could be a more specific
        // article); else use OSM's.
        ...(prior.wiki_url
          ? { wiki_url: prior.wiki_url }
          : cp.wiki_url
            ? { wiki_url: cp.wiki_url }
            : {}),
      };
      byId.delete(cp.id);
      // Track whether anything beyond the always-equal id changed.
      if (
        prior.latitude !== next.latitude ||
        prior.longitude !== next.longitude ||
        prior.height !== next.height ||
        prior.wiki_url !== next.wiki_url
      ) {
        updated++;
      }
      // Re-insert so output is catalog-ordered, not insertion-ordered.
      byId.set(cp.id, next);
    } else {
      byId.set(cp.id, {
        id: cp.id,
        nazwa: cp.nazwa,
        latitude: cp.latitude,
        longitude: cp.longitude,
        ...(cp.height !== undefined ? { height: cp.height } : {}),
        ...(cp.wiki_url ? { wiki_url: cp.wiki_url } : {}),
      });
      added++;
    }
  }

  // Anything left in byId that wasn't in catalog = existing-only peak the
  // owner curated but OSM dropped or never had. Keep it.
  for (const peak of byId.values()) {
    if (!catalog.find((c) => c.id === peak.id)) {
      preservedOnly++;
    }
  }

  // Output sorted by id for stable diffs across reruns.
  const merged = Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
  return { merged, added, updated, preservedOnly };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const write = process.argv.includes('--write');

  console.log(`Querying Overpass for natural=peak in bbox ${BBOX}…`);
  const nodes = await fetchOsmPeaks();
  const catalog = buildCatalog(nodes);

  const existingRaw = await readFile(SEEDS_PATH, 'utf-8');
  const existing = JSON.parse(existingRaw) as ExistingPeak[];

  const { merged, added, updated, preservedOnly } = mergeWithExisting(catalog, existing);

  console.log(
    `Existing: ${existing.length}; catalog: ${catalog.length}; merged: ${merged.length} (added=${added}, updated=${updated}, preserved-not-in-catalog=${preservedOnly})`,
  );

  if (!write) {
    console.log('\n--- DRY RUN ---');
    console.log('Re-run with --write to overwrite apps/api/seeds/peaks.json.');
    console.log('\nFirst 5 merged entries:');
    console.log(JSON.stringify(merged.slice(0, 5), null, 2));
    return;
  }

  // Pretty 2-space indent, trailing newline — match the existing file shape
  // so git diff is minimal on owner-curated fields.
  await writeFile(SEEDS_PATH, JSON.stringify(merged, null, 2) + '\n');
  console.log(`\nWrote ${merged.length} peaks to ${SEEDS_PATH}`);
  console.log("Next: run `corepack pnpm -F api seed` to push to DDB.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
