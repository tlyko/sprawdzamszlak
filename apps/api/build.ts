// Bundle apps/api/src/handler.ts → apps/api/dist/handler.js for AWS Lambda.
//
// Run via `corepack pnpm -F api build` (or `pnpm -F api build` after corepack enable).
//
// Output is a single ESM bundle targeting Node 22 (Lambda runtime nodejs22.x).
// `@aws-sdk/*` is provided by the Lambda runtime, so we externalize it to keep
// the deployable zip small (~15 KB vs ~3 MB).
//
// `@sprawdzamszlak/shared` is bundled in (workspace package, not in runtime).

import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, 'dist');

await mkdir(distDir, { recursive: true });

await build({
  // Two entry points → two outfiles in dist/ (handler.js + fetcher-handler.js).
  // Both share the same zip; Lambda picks which to invoke via the `handler`
  // configuration on each aws_lambda_function resource.
  entryPoints: [
    resolve(here, 'src/handler.ts'),
    resolve(here, 'src/strava/fetcher-handler.ts'),
  ],
  outdir: distDir,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  banner: {
    // ESM bundles don't have __dirname/require; some deps (e.g. legacy
    // CommonJS deps via interop) assume them.
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  // Provided by the Node 22 Lambda runtime.
  external: ['@aws-sdk/*'],
  minify: true,
  sourcemap: true,
  logLevel: 'info',
});

// Lambda's nodejs22.x runtime treats .js as CommonJS unless the closest
// package.json says otherwise. We emit ESM (`format: 'esm'`), so write a
// minimal package.json into dist/ that opts the bundle into ESM.
await writeFile(resolve(distDir, 'package.json'), '{"type":"module"}\n');
