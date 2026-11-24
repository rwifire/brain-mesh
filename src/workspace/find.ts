import { stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/** The nearest directory, from `start` upwards, that contains a `mesh.yaml` file. */
export async function findWorkspaceRoot(start: string): Promise<string | null> {
  let dir = resolve(start);
  for (;;) {
    try {
      if ((await stat(join(dir, 'mesh.yaml'))).isFile()) return dir;
    } catch {
      // not here; keep walking up
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
