import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import type { TestProject } from 'vitest/node';
import { PKG_VERSION } from '../helpers/version.js';

declare module 'vitest' {
  export interface ProvidedContext {
    tarball: string;
  }
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/** Packs the package once (prepack builds it) into a temp dir whose name contains a space. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const dir = await mkdtemp(join(tmpdir(), 'bm pack-'));
  await execa('npm', ['pack', '--pack-destination', dir], { cwd: repoRoot });
  project.provide('tarball', join(dir, `brain-mesh-ai-workspace-${PKG_VERSION}.tgz`));
  return () => rm(dir, { recursive: true, force: true, maxRetries: 5 });
}
