// Postbuild: copy each dynamic-route placeholder shell to a sibling path
// outside its source prefix, so `_redirects` rules can rewrite to it
// without tripping Cloudflare's infinite-loop validator.
//
// Why this exists:
//   Cloudflare Workers Static Assets normalises a destination path by
//   stripping `/index.html` and `/index` before matching against rules.
//   With Next.js static export the dynamic-route shells land under
//   `out/trasy/_/index.html` and `out/szczyty/_/index.html`. A naive
//   redirect like `/trasy/* /trasy/_/index.html 200` is rejected at
//   deploy time (validation error 10021) because the normalised
//   destination `/trasy/_/` matches the source pattern again.
//
// Fix: copy the shells to `out/_shells/<route>.html`, which sits outside
// any redirect source prefix and is not on a path Cloudflare will
// normalise back into a matched rule.
//
// `_redirects` (apps/web/public/_redirects) points at the copies.

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
