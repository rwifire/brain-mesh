import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { assertGate, brainChanges, hasLocalCommits } from '../contribute/gate.js';
import { contributePr } from '../contribute/pr.js';
import { gitOk } from '../git.js';
import type { Host } from '../host/host.js';
import type { CommandDef } from '../main.js';
import { CliError, ErrorCode, ExitCode, type Warning } from '../output.js';
import { findWorkspaceRoot } from '../workspace/find.js';
import { readMesh } from '../workspace/mesh-edit.js';
import { assertGitIdentity, pullPush } from '../workspace/repo.js';

export type CommitRoute = 'personal' | 'direct' | 'pr';

export interface CommitData {
  brain: string;
  /** How the change travels (spec 7.2): personal push, direct commit to an unpublished brain, or a PR. */
  route: CommitRoute;
  /** False when the brain had no changes, and always false for `--dry-run`. */
  committed: boolean;
  /** The new commit (after the rebase, for personal); null when nothing was committed. */
  commit: string | null;
  /** Personal: workspace-relative paths in the commit. Shared: brain-relative paths. */
  files: string[];
  pushed: boolean;
  /** The PR branch; null outside the PR route. */
  branch: string | null;
  pr: { number: number; url: string } | null;
  dryRun: boolean;
}

const PERSONAL = 'brains/personal';
const exists = (p: string) => stat(p).then(() => true, () => false);

function text(d: CommitData): string {
  const where = d.brain === 'personal' ? 'brains/personal/' : `brains/${d.brain}/`;
  if (d.dryRun) return `Would commit ${d.files.length} file${d.files.length === 1 ? '' : 's'} in ${where} (${d.route}).`;
  if (!d.committed) return `Nothing to commit in ${where}.`;
  const n = `${d.files.length} file${d.files.length === 1 ? '' : 's'}`;
  if (d.route === 'pr') return `Opened ${d.pr!.url} from ${d.branch} with ${n} in ${where}.`;
  if (d.route === 'direct') return `Committed ${n} in ${where} (${d.commit!.slice(0, 7)}); the brain is unpublished, so nothing was pushed.`;
  return `Committed ${n} in brains/personal/ (${d.commit!.slice(0, 7)}) ${d.pushed ? 'and pushed.' : 'locally; not pushed.'}`;
}

/** The personal row of spec 7.2 (chunk 6 plan Ruling 13). */
async function commitPersonal(root: string, message: string, dryRun: boolean): Promise<{ data: CommitData; warnings: Warning[] }> {
  const warnings: Warning[] = [];
  const base: CommitData = { brain: 'personal', route: 'personal', committed: false, commit: null, files: [], pushed: false, branch: null, pr: null, dryRun };
  const changed = (await gitOk(root, ['status', '--porcelain', '--', PERSONAL])).trim() !== '';
  if (dryRun) {
    const files = changed ? (await brainChanges(join(root, PERSONAL))).map((f) => `${PERSONAL}/${f}`) : [];
    return { data: { ...base, files }, warnings };
  }
  let files: string[] = [];
  if (changed) {
    await gitOk(root, ['add', '-A', '--', PERSONAL]);
    await gitOk(root, ['commit', '-q', '-m', message, '--', PERSONAL]);
    files = (await gitOk(root, ['show', '--name-only', '--format=', '-z', 'HEAD'])).split('\0').filter((f) => f !== '');
  }
  const { pushed, warnings: syncWarnings } = await pullPush(root);
  warnings.push(...syncWarnings);
  return { data: { ...base, committed: changed, commit: changed ? await gitOk(root, ['rev-parse', 'HEAD']) : null, files, pushed }, warnings };
}

/** The shared unpublished row of spec 7.2: commit straight to the clone's branch; there is no remote. */
async function commitDirect(dir: string, id: string, files: string[], message: string, dryRun: boolean): Promise<CommitData> {
  const base: CommitData = { brain: id, route: 'direct', committed: false, commit: null, files, pushed: false, branch: null, pr: null, dryRun };
  if (dryRun || files.length === 0) return base;
  await gitOk(dir, ['add', '-A']);
  await gitOk(dir, ['commit', '-q', '-m', message]);
  return { ...base, committed: true, commit: await gitOk(dir, ['rev-parse', 'HEAD']) };
}

/**
 * `commit [brain]`: commits a brain's changes by its route of spec 7.2. Personal: commit, rebase,
 * push. Shared unpublished: a direct commit. Shared published `contribute`: a pull request.
 * `read`: refused. Shared brains pass the doctor gate first (chunk 10 plan, decision 2).
 */
export function commitCommandFor(deps: { host: Host }): CommandDef {
  return {
    name: 'commit',
    description: "commit a brain's changes: personal is pushed, a shared brain gets a pull request",
    configure: (cmd) => {
      cmd.argument('[brain]', 'brain to commit', 'personal');
      cmd.requiredOption('-m, --message <text>', 'commit message: what changed and why; its first line is the PR title');
      cmd.option('--body <text>', 'pull request description (default: the message after its first line)');
      cmd.option('--dry-run', 'run the checks and list the files, change nothing');
    },
    run: async (ctx, args, opts) => {
      const id = args[0] ?? 'personal';
      const root = await findWorkspaceRoot(ctx.cwd);
      if (root === null) {
        throw new CliError(ErrorCode.NoWorkspace, `no mesh.yaml found in ${ctx.cwd} or any parent folder`, ExitCode.Failure);
      }
      const message = String(opts.message);
      if (message.split(/\r?\n/)[0]!.trim() === '') {
        throw new CliError(ErrorCode.Usage, '--message needs a first line: it is the commit message and the pull request title', ExitCode.Usage);
      }
      const dryRun = opts.dryRun === true;

      if (id === 'personal') {
        const { data, warnings } = await commitPersonal(root, message, dryRun);
        return { data, text: text(data), warnings };
      }

      const mount = (await readMesh(root)).mounts.find((m) => m.id === id);
      if (mount === undefined) throw new CliError(ErrorCode.UnknownBrain, `unknown brain: ${id} is not a mount in mesh.yaml`, ExitCode.Usage);
      if (mount.mode === 'read') {
        throw new CliError(ErrorCode.ReadOnly, `${id} is mounted read-only, so nothing is written to it; note it in the personal brain instead, or ask its owner`);
      }
      const dir = join(root, 'brains', id);
      if (!(await exists(join(dir, '.git')))) throw new CliError(ErrorCode.Git, `brains/${id}/ is not a git clone; run brain-mesh sync`);
      await assertGitIdentity(dir);
      const files = await brainChanges(dir);
      if (files.length > 0 || (await hasLocalCommits(dir))) await assertGate(root, id);

      if (mount.url === undefined) {
        const data = await commitDirect(dir, id, files, message, dryRun);
        return { data, text: text(data) };
      }
      const mesh = await readMesh(root);
      const { warnings, ...data } = await contributePr({
        root,
        id,
        url: mount.url,
        user: mesh.user,
        message,
        ...(typeof opts.body === 'string' ? { body: opts.body } : {}),
        host: deps.host,
        dryRun,
      });
      return { data, text: text(data), warnings };
    },
  };
}
