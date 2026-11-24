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
          // Windows CI runners need 5–6 s for tests that copy a fixture workspace and git-init it.
          testTimeout: 30_000,
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
