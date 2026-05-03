// Bundle apps/api/src/handler.ts → apps/api/dist/handler.js for AWS Lambda.
// Run with `corepack pnpm -F api build` (or `pnpm -F api build` after corepack enable).
//
// Output is a single ESM bundle that targets Node 22 (Lambda runtime nodejs22.x).
// All deps except `aws-sdk` v3 are bundled — Lambda's Node runtime ships with
// AWS SDK v3 already, so we externalize it to keep the zip small.

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [resolve(here, 'src/handler.ts')],
  outfile: resolve(here, 'dist/handler.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  banner: {
    // ESM doesn't have __dirname/require by default; some deps assume them.
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  // Lambda's nodejs22.x runtime provides @aws-sdk/* — don't bundle to save size.
  external: ['@aws-sdk/*'],
  minify: true,
  sourcemap: true,
  logLevel: 'info',
});
