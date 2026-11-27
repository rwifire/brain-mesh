import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git } from '../git.js';
import { CliError, ErrorCode } from '../output.js';

const lf = (s: string) => s.replace(/\r\n/g, '\n');

/**
 * A unified diff (3 lines of context) from `before` to `after`, with `--- a/<path>` and
 * `+++ b/<path>` headers (`/dev/null` for a missing side). Line endings are ignored; equal sides
 * give `''`. Made with `git diff --no-index` on two temp files.
 */
export async function unifiedDiff(path: string, before: string | null, after: string | null): Promise<string> {
  const [a, b] = [lf(before ?? ''), lf(after ?? '')];
  if (a === b) return '';
  const dir = await mkdtemp(join(tmpdir(), 'brain-mesh-diff-'));
  try {
    await writeFile(join(dir, 'a'), a, 'utf8');
    await writeFile(join(dir, 'b'), b, 'utf8');
    const r = await git(dir, ['-c', 'core.autocrlf=false', 'diff', '--no-index', '--no-color', '-U3', '--', 'a', 'b']);
    if (r.exitCode !== 1) throw new CliError(ErrorCode.Git, `git diff failed: ${r.stderr.trim().split('\n')[0] ?? ''}`);
    const lines = r.stdout.split('\n');
    const start = lines.findIndex((l) => l.startsWith('@@'));
    const head = [before === null ? '--- /dev/null' : `--- a/${path}`, after === null ? '+++ /dev/null' : `+++ b/${path}`];
    return [...head, ...lines.slice(start)].join('\n') + '\n';
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
