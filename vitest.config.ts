import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // show console output of passing tests too (the e2e npx timing line in CI logs)
    silent: false,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts', 'test/helpers/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.test.ts'],
          globalSetup: 'test/e2e/setup.ts',
          testTimeout: 180_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
