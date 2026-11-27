import { runChecks } from '../doctor/run.js';
import { gitOk } from '../git.js';
import { CliError, ErrorCode } from '../output.js';
import { loadWorkspace } from '../workspace/load.js';

/** Changed paths of the git repo `dir` (brain-relative POSIX), including untracked files; a rename gives its new path. */
export async function brainChanges(dir: string): Promise<string[]> {
  const out = await gitOk(dir, ['status', '--porcelain', '-z', '--untracked-files=all']);
  const entries = out.split('\0');
  const paths: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (e.length < 4) continue;
    paths.push(e.slice(3));
    // In -z output a rename or copy is followed by its old path as a separate entry.
    if (e[0] === 'R' || e[0] === 'C') i++;
  }
  return [...new Set(paths)].sort();
}

const MAX_LISTED = 5;

/**
 * The shared-brain gate (chunk 10 plan, decision 2): throws `E_DOCTOR_ERRORS` while the offline
 * `doctor` checks report errors for brain `id`. Workspace-level findings don't block a brain.
 */
export async function assertGate(root: string, id: string): Promise<void> {
  const errors = runChecks(await loadWorkspace(root), id).filter((f) => f.severity === 'error' && f.brain === id);
  if (errors.length === 0) return;
  const prefix = `brains/${id}/`;
  const listed = errors.slice(0, MAX_LISTED).map((f) => `${f.code} ${f.path === null ? '' : f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path}`.trim());
  const more = errors.length > MAX_LISTED ? `, and ${errors.length - MAX_LISTED} more` : '';
  throw new CliError(
    ErrorCode.DoctorErrors,
    `brain-mesh doctor ${id} reports ${errors.length} error${errors.length === 1 ? '' : 's'}: ${listed.join('; ')}${more}. Run brain-mesh doctor ${id} --fix and fix the rest before committing`,
  );
}
