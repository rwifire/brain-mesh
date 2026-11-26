import { gitOk } from '../git.js';
import type { CommandDef } from '../main.js';
import { CliError, ErrorCode, ExitCode, type Warning } from '../output.js';
import { findWorkspaceRoot } from '../workspace/find.js';
import { pullPush } from '../workspace/repo.js';

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

function text(d: CommitData): string {
  if (!d.committed) return 'Nothing to commit in brains/personal/.';
  const n = `${d.files.length} file${d.files.length === 1 ? '' : 's'}`;
  return `Committed ${n} in brains/personal/ (${d.commit!.slice(0, 7)}) ${d.pushed ? 'and pushed.' : 'locally; not pushed.'}`;
}

/**
 * `commit`: the personal row of spec 7.2 (plan Ruling 13). Commits only `brains/personal/`,
 * then `pull --rebase` (other changes stashed and restored with `--index`) and `push`. Other staged and unstaged changes are left as they were.
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

    const { pushed, warnings: syncWarnings } = await pullPush(root);
    warnings.push(...syncWarnings);

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
