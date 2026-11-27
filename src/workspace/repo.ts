import { stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { git, gitOk } from '../git.js';
import { CliError, ErrorCode, type Warning } from '../output.js';

/** The workspace files `mount`, `unmount`, `brain new` and `brain publish` commit (chunk 9 plan, decision 2). */
export const WORKSPACE_CONFIG = ['mesh.yaml', 'AGENTS.md', '.gitignore'] as const;

const firstLine = (s: string) => s.trim().split('\n')[0]!.trim();
const exists = (p: string) => stat(p).then(() => true, () => false);

/** True while a rebase stopped (e.g. on a conflict) is in progress. */
async function rebaseInProgress(root: string): Promise<boolean> {
  for (const name of ['rebase-merge', 'rebase-apply']) {
    const p = await gitOk(root, ['rev-parse', '--git-path', name]);
    if (await exists(isAbsolute(p) ? p : join(root, p))) return true;
  }
  return false;
}

/** Throws `E_GIT` unless git knows who commits (`user.name` and `user.email`); call before any change. */
export async function assertGitIdentity(root: string): Promise<void> {
  if ((await git(root, ['var', 'GIT_COMMITTER_IDENT'])).exitCode !== 0) {
    throw new CliError(ErrorCode.Git, 'git does not know who you are; set git config --global user.name and user.email');
  }
}

/** Fails unless `url` is reachable and holds no refs; `what` names the command that needs it empty. */
export async function assertEmptyRemote(cwd: string, url: string, what: string): Promise<void> {
  const r = await git(cwd, ['ls-remote', url], { network: true });
  if (r.exitCode !== 0) throw new CliError(ErrorCode.Git, `cannot reach ${url}: ${firstLine(r.stderr)}`);
  if (r.stdout.trim() !== '') throw new CliError(ErrorCode.RemoteNotEmpty, `${url} already has commits; ${what} needs an empty repo`);
}

/** Commits the changed ones of `paths` (and nothing else); returns the commit, or null when none changed. */
export async function commitPaths(root: string, paths: readonly string[], message: string): Promise<string | null> {
  const status = await gitOk(root, ['status', '--porcelain', '-z', '--untracked-files=all', '--', ...paths]);
  const changed = status
    .split('\0')
    .filter((e) => e.length > 3)
    .map((e) => e.slice(3));
  if (changed.length === 0) return null;
  await gitOk(root, ['add', '-A', '--', ...changed]);
  await gitOk(root, ['commit', '-q', '-m', message, '--', ...changed]);
  return gitOk(root, ['rev-parse', 'HEAD']);
}

/**
 * Pulls with rebase and pushes the workspace repo. Other changes are stashed with `--index` and
 * restored. Throws `E_SYNC_CONFLICT` when the rebase stops; warns with `W_NO_UPSTREAM`,
 * `W_PULL_FAILED`, `W_PUSH_FAILED` or `W_STASH_KEPT`.
 */
export async function pullPush(root: string): Promise<{ pushed: boolean; warnings: Warning[] }> {
  const warnings: Warning[] = [];
  let pushed = false;
  const upstream = await git(root, ['rev-parse', '--abbrev-ref', '@{u}']);
  if (upstream.exitCode !== 0) {
    warnings.push({ code: 'W_NO_UPSTREAM', message: 'the workspace has no upstream branch; nothing was pulled or pushed' });
  } else {
    // A stash popped with --index keeps staged changes staged; --autostash would unstage them.
    // Only a stash this run created is popped: `stash push` can save nothing (or fail, e.g. on
    // intent-to-add entries) while status shows changes, and the user's own stash must stay put (final review I3).
    const stashRef = async () => (await git(root, ['rev-parse', '-q', '--verify', 'refs/stash'])).stdout.trim();
    let stashed = false;
    if ((await gitOk(root, ['status', '--porcelain', '--untracked-files=no'])).trim() !== '') {
      const before = await stashRef();
      await git(root, ['stash', 'push', '-q', '-m', 'brain-mesh commit']);
      stashed = (await stashRef()) !== before;
    }
    const restore = async () => {
      if (!stashed) return;
      const pop = await git(root, ['stash', 'pop', '-q', '--index']);
      if (pop.exitCode !== 0) {
        warnings.push({
          code: 'W_STASH_KEPT',
          message: `restoring your other changes conflicted (${firstLine(pop.stderr) || 'git stash pop failed'}): the files may hold conflict markers, and the changes are still in git stash; check git status and git stash list`,
        });
      }
    };
    const pull = await git(root, ['pull', '-q', '--rebase'], { network: true });
    if (pull.exitCode !== 0 && (await rebaseInProgress(root))) {
      const unmerged = await git(root, ['diff', '--name-only', '--diff-filter=U']);
      const files = unmerged.stdout.split('\n').map((f) => f.trim()).filter((f) => f !== '');
      await git(root, ['rebase', '--abort']);
      await restore();
      const what = files.length === 0 ? 'your changes conflict' : `${files.join(', ')} ${files.length === 1 ? 'conflicts' : 'conflict'}`;
      const config = files.some((f) => (WORKSPACE_CONFIG as readonly string[]).includes(f));
      throw new CliError(
        ErrorCode.SyncConflict,
        `your commit is kept locally, but ${what} with ${upstream.stdout.trim()}; nothing was pushed. Run git pull --rebase, resolve the conflict${config ? ' (in mesh.yaml keep both mount entries; take either side of AGENTS.md and .gitignore, brain-mesh regenerates them)' : ''}, git rebase --continue, then brain-mesh sync`,
      );
    }
    await restore();
    if (pull.exitCode !== 0) {
      warnings.push({ code: 'W_PULL_FAILED', message: `could not pull: ${firstLine(pull.stderr)}; nothing was pushed` });
    } else {
      const push = await git(root, ['push', '-q'], { network: true });
      if (push.exitCode === 0) pushed = true;
      else warnings.push({ code: 'W_PUSH_FAILED', message: `could not push: ${firstLine(push.stderr)}` });
    }
  }
  return { pushed, warnings };
}
