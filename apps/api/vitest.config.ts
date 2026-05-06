import { defineConfig } from 'vitest/config';

// Vitest config for apps/api. Vite handles TS via esbuild — same toolchain
// the Lambda bundle uses, so test transpile semantics match prod.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Force serial execution by default — most tests touch module-level
    // caches (cf-access loadConfig cache, etc.) and resetModules between
    // tests is the cleanest way to isolate them. Pool=forks lets each
    // test file have its own module registry without `vi.resetModules`
    // between every test.
    pool: 'forks',
    // No global setup file — each test file owns its mocks. Keeps the
    // dependency graph between test files minimal.
  },
});
