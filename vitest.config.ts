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
          // Windows CI runners need 5–10 s per fixture workspace (copy and git-init), and a test may build
          // several; deleting one in the onTestFinished hook can pass 10 s. A slow runner then misses
          // 30 s and 10 s limits (run 46038256901), so both have headroom; no test waits on a timeout.
          testTimeout: 90_000,
          hookTimeout: 60_000,
          // No test spawns a real npx warm-up (chunk 12 plan, decision 1).
          env: { BRAIN_MESH_NO_NPX_WARM: '1' },
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.test.ts'],
          globalSetup: 'test/e2e/setup.ts',
          testTimeout: 180_000,
          hookTimeout: 180_000,
          env: { BRAIN_MESH_NO_NPX_WARM: '1' },
        },
      },
    ],
  },
});
