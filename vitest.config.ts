import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for HTTP-layer and unit tests.
 *
 * Scope: pure helpers (src/lib/*) and route handlers (src/app/api/**).
 * The audio engine has its own assertion suite at scripts/test-audio.ts;
 * those tests are not migrated here because they intentionally run as a
 * plain node script with --experimental-strip-types and are not the same
 * shape as a unit test.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'services/audio-worker', 'scripts'],
    globals: false,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/types.ts'],
      reporter: ['text', 'html'],
    },
  },
});
