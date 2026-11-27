import { execa } from 'execa';
import type { Warning } from '../output.js';

/** Runs the pinned CLI once so its package is in the npx cache. Throws on failure. */
export type Warm = (pin: string, cwd: string) => Promise<void>;

type Runner = (command: string, args: string[], opts: { cwd: string; timeout: number; shell: boolean; stdio: 'ignore' }) => Promise<unknown>;

/**
 * `npx -y brain-mesh-ai-workspace@<pin> version --json` (chunk 12 plan, decision 1). `init` usually
 * runs as `@next` or `@latest`, and npx caches by spec, so the first skill call would start cold.
 * On Windows npx is `npx.cmd`, started through the shell. The output is ignored: on Windows a timeout kills only the
 * shell, and execa would wait for npx to close the pipes it inherited. `BRAIN_MESH_NO_NPX_WARM=1` skips it.
 */
export function warmNpxWith(runner: Runner): Warm {
  return async (pin, cwd) => {
    if (process.env.BRAIN_MESH_NO_NPX_WARM === '1') return;
    const win = process.platform === 'win32';
    await runner(win ? 'npx.cmd' : 'npx', ['-y', `brain-mesh-ai-workspace@${pin}`, 'version', '--json'], { cwd, timeout: 120_000, shell: win, stdio: 'ignore' });
  };
}

export const warmNpx: Warm = warmNpxWith((command, args, opts) => execa(command, args, opts));

const firstLine = (s: string) => s.trim().split('\n')[0]!.trim();

/** Best effort: a failed or timed-out warm-up is a warning, never an error. */
export async function warmCache(warm: Warm, pin: string, cwd: string): Promise<Warning[]> {
  try {
    await warm(pin, cwd);
    return [];
  } catch (err) {
    const why = err instanceof Error ? firstLine(err.message) : String(err);
    return [
      {
        code: 'W_NPX_WARM_FAILED',
        message: `could not load brain-mesh-ai-workspace@${pin} into the npx cache (${why}); the first agent call may take a few seconds longer`,
      },
    ];
  }
}
