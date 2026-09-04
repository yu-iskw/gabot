import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@gabot/common': fileURLToPath(new URL('./packages/common/src/index.ts', import.meta.url)),
    },
  },
  test: {
    projects: ['packages/*/vitest.config.ts', 'tests/vitest.config.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        'packages/*/src/**/*.{test,spec}.ts',
        'packages/*/src/**/*.d.ts',
        'packages/*/dist/**',
        'packages/*/src/index.ts',
        'packages/app/src/firebase.ts',
        'packages/api/src/migrate.ts',
        'packages/api/src/store/postgres-store.ts',
        'packages/api/src/store/types.ts',
        'packages/api/src/http-sandbox.ts',
        'packages/api/src/auth.ts',
        'packages/api/src/db/schema.ts',
        'packages/common/src/ports.ts',
        'packages/computer/src/chromium-driver.ts',
        '**/*.config.{js,mjs,cjs,ts}',
      ],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});
