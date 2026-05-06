// One-shot data migration: switch every peak with a Slovak/Czech wiki_url
// to the Polish-Wikipedia equivalent (when one exists), and adopt the
// Polish article title as `nazwa`.
//
// Usage:
//   pnpm -F api polonize:peaks --dry-run    # report-only
//   pnpm -F api polonize:peaks              # rewrite seeds/peaks.json
//
// Approach:
//   1. Read seeds/peaks.json.
//   2. Group peaks by their wiki_url's host (sk.wikipedia, cs.wikipedia,
//      pl.wikipedia, other).
//   3. Batch the non-pl titles to <host>.wikipedia.org/w/api.php with
//      prop=langlinks&lllang=pl (up to 50 titles per call) and collect
//      the pl-side title for each.
//   4. For peaks where a pl article exists:
//         - replace wiki_url with the pl URL
//         - replace nazwa with the pl article title, stripping the
//           qualifier "(…)" suffix used as a disambiguator on Wikipedia
//   5. Write peaks.json back (sorted by id, 2-space indent — keeps the
//      diff readable).
//
// Peaks without a wiki_url, or with a wiki_url that already points at
// pl.wikipedia.org, are left alone. Slovak-only peaks (no pl article)
// keep their existing wiki_url + name; the report flags them so the
// owner can decide whether to drop them, transliterate the name, or
// leave them with the sk article.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Peak {
  id: string;
  nazwa: string;
  wiki_url?: string;
  [key: string]: unknown;
}

interface LangLinkResp {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        langlinks?: Array<{ lang: string; '*': string }>;
      }
    >;
  };
}

const SEEDS_PATH = resolve(import.meta.dirname, '..', 'seeds', 'peaks.json');
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 40; // Wikipedia API caps `titles` at 50; use 40 for headroom.

// Wikipedia article titles often carry a parenthesised disambiguator
// e.g. "Gerlach (szczyt)" or "Bystra (Tatry Zachodnie)". The disambiguator
// is for navigation on Wikipedia; the name proper is what comes before.
function stripDisambiguator(title: string): string {
  const idx = title.indexOf(' (');
  return idx === -1 ? title : title.slice(0, idx);
}

function decodeWikiTitleFromUrl(url: string): string | null {
  // https://sk.wikipedia.org/wiki/Gerlachovsk%C3%BD_%C5%A1t%C3%ADt
  // → "Gerlachovský štít"
  const match = url.match(/\/wiki\/(.+)$/);
  if (!match) return null;
  const rawTitle = match[1];
  if (!rawTitle) return null;
  try {
    return decodeURIComponent(rawTitle).replace(/_/g, ' ');
  } catch {
    return null;
  }
}

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function plUrlForTitle(title: string): string {
  // pl.wikipedia uses the same percent-encoding rules; spaces become
  // underscores and everything else gets encoded.
  return `https://pl.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

interface LangLinksResult {
  byTitle: Map<string, string>; // sk title → pl title
}

async function fetchLangLinksBatch(
  host: string,
  titles: string[],
): Promise<LangLinksResult> {
  if (titles.length === 0) return { byTitle: new Map() };

  const url = new URL(`https://${host}/w/api.php`);
  url.searchParams.set('action', 'query');
  url.searchParams.set('prop', 'langlinks');
  url.searchParams.set('lllang', 'pl');
  url.searchParams.set('lllimit', '500');
  url.searchParams.set('titles', titles.join('|'));
  url.searchParams.set('format', 'json');
  // Wikipedia normalises titles (canonical form, redirects). We don't
  // explicitly request `redirects=1` because for our case the canonical
  // form is what we want.

  const resp = await fetch(url.toString(), {
    headers: {
      'User-Agent':
        'sprawdzamszlak.pl polonize-peaks/1.0 (https://github.com/tlyko/sprawdzamszlak)',
    },
  });
  if (!resp.ok) {
    throw new Error(`Wikipedia API ${host} returned HTTP ${resp.status}`);
  }
  const json = (await resp.json()) as LangLinkResp;

  const byTitle = new Map<string, string>();
  const pages = json.query?.pages ?? {};
  for (const page of Object.values(pages)) {
    const sourceTitle = page.title;
    const pl = page.langlinks?.find((l) => l.lang === 'pl');
    if (sourceTitle && pl?.['*']) {
      byTitle.set(sourceTitle, pl['*']);
    }
  }
  return { byTitle };
}

interface Change {
  id: string;
  oldName: string;
  newName: string;
  oldUrl: string;
  newUrl: string;
}

interface Skipped {
  id: string;
  name: string;
  url: string;
  host: string;
  reason: string;
}

async function main(): Promise<void> {
  const raw = readFileSync(SEEDS_PATH, 'utf-8');
  const peaks = JSON.parse(raw) as Peak[];

  const changes: Change[] = [];
  const skipped: Skipped[] = [];
  const noWiki: string[] = [];
  const alreadyPl: number = peaks.filter(
    (p) => p.wiki_url && hostFromUrl(p.wiki_url) === 'pl.wikipedia.org',
  ).length;

  // Group peaks by Wikipedia host so we can batch per language API.
  const byHost = new Map<string, Array<{ peak: Peak; sourceTitle: string }>>();
  for (const peak of peaks) {
    if (!peak.wiki_url) {
      noWiki.push(peak.id);
      continue;
    }
    const host = hostFromUrl(peak.wiki_url);
    if (!host) continue;
    if (host === 'pl.wikipedia.org') continue;
    const sourceTitle = decodeWikiTitleFromUrl(peak.wiki_url);
    if (!sourceTitle) continue;
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host)!.push({ peak, sourceTitle });
  }

  for (const [host, items] of byHost) {
    console.log(`Querying ${host} for ${items.length} peaks…`);
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const titles = batch.map((it) => it.sourceTitle);
      const { byTitle } = await fetchLangLinksBatch(host, titles);

      for (const { peak, sourceTitle } of batch) {
        const plTitle = byTitle.get(sourceTitle);
        if (!plTitle) {
          skipped.push({
            id: peak.id,
            name: peak.nazwa,
            url: peak.wiki_url!,
            host,
            reason: 'no pl interlanguage link',
          });
          continue;
        }
        const cleanName = stripDisambiguator(plTitle);
        const newUrl = plUrlForTitle(plTitle);
        if (cleanName === peak.nazwa && newUrl === peak.wiki_url) continue;
        changes.push({
          id: peak.id,
          oldName: peak.nazwa,
          newName: cleanName,
          oldUrl: peak.wiki_url!,
          newUrl,
        });
        peak.nazwa = cleanName;
        peak.wiki_url = newUrl;
      }
    }
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`Total peaks:           ${peaks.length}`);
  console.log(`Already on pl.wiki:    ${alreadyPl}`);
  console.log(`Switched to pl.wiki:   ${changes.length}`);
  console.log(`Skipped (no pl link):  ${skipped.length}`);
  console.log(`No wiki_url at all:    ${noWiki.length}`);
  console.log('');

  if (changes.length > 0) {
    console.log('=== Changes (first 30) ===');
    for (const c of changes.slice(0, 30)) {
      const nameChanged = c.oldName !== c.newName ? ` (was: "${c.oldName}")` : '';
      console.log(`  ${c.id.padEnd(30)} → ${c.newName}${nameChanged}`);
    }
    if (changes.length > 30) console.log(`  …and ${changes.length - 30} more`);
    console.log('');
  }

  if (skipped.length > 0) {
    console.log('=== Skipped (first 30) ===');
    for (const s of skipped.slice(0, 30)) {
      console.log(`  ${s.id.padEnd(30)} — ${s.host} ${s.url}`);
    }
    if (skipped.length > 30) console.log(`  …and ${skipped.length - 30} more`);
    console.log('');
  }

  if (DRY_RUN) {
    console.log('Dry-run — no file written. Drop --dry-run to apply.');
    return;
  }

  // Sort by id so re-runs of the script produce a stable diff.
  peaks.sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(SEEDS_PATH, `${JSON.stringify(peaks, null, 2)}\n`, 'utf-8');
  console.log(`Wrote ${SEEDS_PATH}`);
}

main().catch((err) => {
  console.error('polonize-peaks failed', err);
  process.exit(1);
});
