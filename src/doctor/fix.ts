import { lstat, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { planGenerated } from '../generate/plan.js';
import type { Warning } from '../output.js';
import type { WorkspaceModel } from '../workspace/load.js';
import type { CheckCode } from './codes.js';

export interface FixedFile {
  code: CheckCode;
  /** Workspace-relative POSIX path. */
  path: string;
}

/**
 * Writes every out-of-date generated file of `brain` (or of all brains). A file that cannot be
 * written becomes a warning and the rest are still written. Creates never replace an existing
 * entry, and nothing is written through a symbolic link.
 */
export async function fixGenerated(ws: WorkspaceModel, brain: string | undefined): Promise<{ fixed: FixedFile[]; warnings: Warning[] }> {
  const fixed: FixedFile[] = [];
  const warnings: Warning[] = [];
  for (const file of planGenerated(ws, brain).files) {
    if (file.next === file.current) continue;
    const abs = join(ws.root, ...file.path.split('/'));
    try {
      if (file.current === null) {
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, file.next, { encoding: 'utf8', flag: 'wx' });
      } else {
        if ((await lstat(abs)).isSymbolicLink()) throw new Error('it is a symbolic link');
        await writeFile(abs, file.next, 'utf8');
      }
      fixed.push({ code: file.code, path: file.path });
    } catch (err) {
      const reason = err instanceof Error ? err.message.split('\n')[0]! : String(err);
      warnings.push({ code: 'W_WRITE_FAILED', message: `could not write ${file.path}: ${reason}` });
    }
  }
  return { fixed, warnings };
}
