// Postbuild: copy each dynamic-route placeholder shell to `out/_shells/<route>.html`,
// which is what the Worker fetches via env.ASSETS.fetch() on direct visits to
// /trasy/<slug>/ and /szczyty/<slug>/.
//
// Why this lives outside the source prefix:
//   Next.js static export emits `out/trasy/_/index.html` and
//   `out/szczyty/_/index.html`. The Worker can't fetch those URLs as-is —
//   Cloudflare normalises `/trasy/_/index.html` back to `/trasy/_/` which
//   would re-enter our SPA-rewrite branch and loop. Copying the shells to
//   `/_shells/*.html` (outside any rewrite prefix) makes them addressable
//   directly via env.ASSETS.fetch().
//
// The Worker (apps/web/worker/index.ts) reads from `/_shells/*.html`.

import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'out');
const shellsDir = resolve(outDir, '_shells');

const shells = [
  { from: 'trasy/_/index.html', to: '_shells/trasy.html' },
  { from: 'szczyty/_/index.html', to: '_shells/szczyty.html' },
];

await mkdir(shellsDir, { recursive: true });

for (const { from, to } of shells) {
  const src = resolve(outDir, from);
  const dst = resolve(outDir, to);
  await copyFile(src, dst);
  console.log(`copied ${from} -> ${to}`);
}
