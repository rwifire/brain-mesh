import { stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { git, gitOk } from '../git.js';
import type { CommandDef } from '../main.js';
import { CliError, ErrorCode, ExitCode, type Warning } from '../output.js';
import { findWorkspaceRoot } from '../workspace/find.js';

export interface CommitData {
  brain: 'personal';
  /** False when `brains/personal/` had no changes. */
  committed: boolean;
  /** The new commit (after the rebase); null when nothing was committed. */
  commit: string | null;
  /** Workspace-relative paths in the new commit. */
  files: string[];
  pushed: boolean;
}

const PERSONAL = 'brains/personal';
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

function text(d: CommitData): string {
  if (!d.committed) return 'Nothing to commit in brains/personal/.';
  const n = `${d.files.length} file${d.files.length === 1 ? '' : 's'}`;
  return `Committed ${n} in brains/personal/ (${d.commit!.slice(0, 7)}) ${d.pushed ? 'and pushed.' : 'locally; not pushed.'}`;
}

/**
 * `commit`: the personal row of spec 7.2 (plan Ruling 13). Commits only `brains/personal/`,
 * then `pull --rebase --autostash` and `push`. Other staged and unstaged changes are left as they were.
 */
export const commitCommand: CommandDef = {
  name: 'commit',
  description: "commit the personal brain's changes, pull with rebase and push",
  configure: (cmd) => {
    cmd.argument('[brain]', 'brain to commit', 'personal');
    cmd.requiredOption('-m, --message <text>', 'commit message: what changed and why');
  },
  run: async (ctx, args, opts) => {
    const brain = args[0] ?? 'personal';
    if (brain !== 'personal') {
      throw new CliError(ErrorCode.NotSupported, 'committing to shared brains is not supported yet; only the personal brain can be committed');
    }
    const root = await findWorkspaceRoot(ctx.cwd);
    if (root === null) {
      throw new CliError(ErrorCode.NoWorkspace, `no mesh.yaml found in ${ctx.cwd} or any parent folder`, ExitCode.Failure);
    }
    const message = String(opts.message);
    const warnings: Warning[] = [];

    let committed = false;
    let files: string[] = [];
    if ((await gitOk(root, ['status', '--porcelain', '--', PERSONAL])).trim() !== '') {
      await gitOk(root, ['add', '-A', '--', PERSONAL]);
      await gitOk(root, ['commit', '-q', '-m', message, '--', PERSONAL]);
      committed = true;
      files = (await gitOk(root, ['show', '--name-only', '--format=', '-z', 'HEAD'])).split('\0').filter((f) => f !== '');
    }

    let pushed = false;
    const upstream = await git(root, ['rev-parse', '--abbrev-ref', '@{u}']);
    if (upstream.exitCode !== 0) {
      warnings.push({ code: 'W_NO_UPSTREAM', message: 'the workspace has no upstream branch; nothing was pulled or pushed' });
    } else {
      // A stash popped with --index keeps staged changes staged; --autostash would unstage them.
      const stashed = (await gitOk(root, ['status', '--porcelain', '--untracked-files=no'])).trim() !== '';
      if (stashed) await gitOk(root, ['stash', 'push', '-q', '-m', 'brain-mesh commit']);
      const restore = async () => {
        if (!stashed) return;
        const pop = await git(root, ['stash', 'pop', '-q', '--index']);
        if (pop.exitCode !== 0) {
          warnings.push({ code: 'W_STASH_KEPT', message: `your other changes could not be restored and are kept in git stash: ${firstLine(pop.stderr)}` });
        }
      };
      const pull = await git(root, ['pull', '-q', '--rebase']);
      if (pull.exitCode !== 0 && (await rebaseInProgress(root))) {
        await git(root, ['rebase', '--abort']);
        await restore();
        throw new CliError(
          ErrorCode.SyncConflict,
          `your commit is kept locally, but brains/personal/ conflicts with ${upstream.stdout.trim()}; nothing was pushed. Run git pull --rebase, resolve the conflict, then git push`,
        );
      }
      await restore();
      if (pull.exitCode !== 0) {
        warnings.push({ code: 'W_PULL_FAILED', message: `could not pull: ${firstLine(pull.stderr)}; nothing was pushed` });
      } else {
        const push = await git(root, ['push', '-q']);
        if (push.exitCode === 0) pushed = true;
        else warnings.push({ code: 'W_PUSH_FAILED', message: `could not push: ${firstLine(push.stderr)}` });
      }
    }

    const data: CommitData = {
      brain: 'personal',
      committed,
      commit: committed ? await gitOk(root, ['rev-parse', 'HEAD']) : null,
      files,
      pushed,
    };
    return { data, text: text(data), warnings };
  },
};
