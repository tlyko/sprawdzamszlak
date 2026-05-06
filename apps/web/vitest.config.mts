import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Vitest config for apps/web. We test pure functions in lib/ and
// components/*/ — no DOM, no React rendering — so the default node
// environment is enough; jsdom isn't pulled in.
//
// vite-tsconfig-paths resolves `@/components/...` style imports the
// same way Next.js does, so test files can use the same import paths
// as the source.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['{components,lib,app}/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
  },
});
