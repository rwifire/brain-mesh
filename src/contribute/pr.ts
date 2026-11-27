import { join } from 'node:path';
import type { CommitData } from '../commands/commit.js';
import { fixGenerated } from '../doctor/fix.js';
import { git, gitOk } from '../git.js';
import type { Host } from '../host/host.js';
import { checkPushRights } from '../mount/rights.js';
import { CliError, ErrorCode, type Warning } from '../output.js';
import { loadWorkspace } from '../workspace/load.js';
import { assertGate, brainChanges, hasLocalCommits } from './gate.js';
import { prSlug } from './slug.js';

const firstLine = (s: string) => s.trim().split('\n')[0]!.trim();
const RIGHTS_HINT = 'contributing needs push rights on the brain repo; ask its owner for write access';
const STASH_MESSAGE = 'brain-mesh contribute';

/** Title and body of the PR: the message's first line, and `--body` or the message after its first line (decision 6). */
function prText(message: string, body: string | undefined): { title: string; body: string } {
  const [first = '', ...rest] = message.split(/\r?\n/);
  return { title: first.trim(), body: body ?? rest.join('\n').trim() };
}

/** The default branch of `origin`, asked from the remote itself (`ls-remote --symref`). */
async function remoteDefault(dir: string, id: string): Promise<string> {
  const r = await git(dir, ['ls-remote', '--symref', 'origin', 'HEAD'], { network: true });
  const m = /^ref: refs\/heads\/(\S+)\s+HEAD/m.exec(r.stdout);
  if (r.exitCode !== 0 || m === null) {
    throw new CliError(ErrorCode.Git, `could not read the default branch of brains/${id}/'s origin: ${firstLine(r.stderr) || 'no HEAD'}`);
  }
  return m[1]!;
}

/** `mesh/<user>/<slug>`, or with `-2`, `-3`, … when that name is taken locally or on `origin`. */
async function freeBranch(dir: string, wanted: string): Promise<string> {
  const remote = await git(dir, ['ls-remote', '--heads', 'origin', `${wanted}*`], { network: true });
  const local = await git(dir, ['branch', '--list', `${wanted}*`, '--format=%(refname:short)']);
  const taken = new Set<string>([
    ...remote.stdout.split('\n').map((l) => l.split('\t')[1]?.replace(/^refs\/heads\//, '') ?? ''),
    ...local.stdout.split('\n').map((l) => l.trim()),
  ]);
  if (!taken.has(wanted)) return wanted;
  for (let n = 2; ; n++) if (!taken.has(`${wanted}-${n}`)) return `${wanted}-${n}`;
}

/**
 * The published `contribute` row of spec 7.2 (chunk 10 plan, decisions 3–6). Every check runs
 * before the first git change. The branch starts from fresh `origin/<default>` and carries the
 * clone's local-only commits and its uncommitted changes; generated content is regenerated there.
 * Any failure before the push puts the clone back exactly as it was; a failed PR call keeps the
 * pushed branch and names the compare URL.
 */
export async function contributePr(o: {
  root: string;
  id: string;
  url: string;
  user: string;
  message: string;
  body?: string;
  host: Host;
  dryRun: boolean;
}): Promise<CommitData & { warnings: Warning[] }> {
  const { root, id, host } = o;
  const dir = join(root, 'brains', id);
  const warnings: Warning[] = [];
  const files = await brainChanges(dir);
  const result: CommitData = { brain: id, route: 'pr', committed: false, commit: null, files, pushed: false, branch: null, pr: null, dryRun: o.dryRun };
  if (files.length === 0 && !(await hasLocalCommits(dir))) return { ...result, warnings };

  const repo = host.repoOf(o.url);
  if (repo === null) {
    throw new CliError(ErrorCode.NotSupported, `${id} is published at ${o.url}, which is not on github.com; pull requests can only be opened there`);
  }
  const wanted = `mesh/${o.user}/${prSlug(o.message)}`;
  if (o.dryRun) return { ...result, branch: wanted, warnings };

  await checkPushRights(host, o.url, warnings, RIGHTS_HINT);
  const base = await remoteDefault(dir, id);
  const current = await git(dir, ['symbolic-ref', '--short', '-q', 'HEAD']);
  if (current.exitCode !== 0 || current.stdout.trim() !== base) {
    const on = current.exitCode === 0 ? `branch ${current.stdout.trim()}` : 'a detached HEAD';
    throw new CliError(ErrorCode.Git, `brains/${id}/ is on ${on}, but contributions start from ${base}; run git switch ${base} in brains/${id}/ first`);
  }
  const fetch = await git(dir, ['fetch', '-q', 'origin'], { network: true });
  if (fetch.exitCode !== 0) throw new CliError(ErrorCode.Git, `could not fetch ${o.url}: ${firstLine(fetch.stderr)}`);
  const branch = await freeBranch(dir, wanted);
  // Merges and commits whose patch is already upstream are left out: they cannot be cherry-picked.
  const localCommits = (await gitOk(dir, ['rev-list', '--reverse', '--no-merges', '--cherry-pick', '--right-only', `origin/${base}...HEAD`]))
    .split('\n')
    .filter((c) => c !== '');

  // From here on the clone changes; `restore` puts it back exactly as it was.
  // A clean tree (local commits only) has nothing to stash.
  const stashed = files.length > 0;
  if (stashed) await gitOk(dir, ['stash', 'push', '-q', '-u', '-m', STASH_MESSAGE]);
  /** Puts the clone back; returns git's reason when the stash could not be popped, else null. */
  const restore = async (): Promise<string | null> => {
    await git(dir, ['cherry-pick', '--abort']);
    await git(dir, ['reset', '-q', '--hard']);
    await git(dir, ['clean', '-q', '-fd']);
    await git(dir, ['switch', '-q', '-f', base]);
    await git(dir, ['branch', '-q', '-D', branch]);
    if (!stashed) return null;
    const pop = await git(dir, ['stash', 'pop', '-q']);
    return pop.exitCode === 0 ? null : firstLine(pop.stderr) || 'git stash pop failed';
  };
  let restored = false;
  /** Restores the clone and throws `err`; `back` is added only when the changes really are back. */
  const fail = async (err: CliError, back = ''): Promise<never> => {
    restored = true;
    const kept = await restore();
    const where =
      kept === null
        ? back
        : `. Your changes could not be put back (${kept}): they are kept in git stash (${STASH_MESSAGE}) in brains/${id}/; run git stash pop there`;
    throw new CliError(err.code, `${err.message}${where}`, err.exitCode);
  };
  const update = localCommits.length > 0 ? `git rebase origin/${base}` : `git merge --ff-only origin/${base}`;
  const conflict = (what: string) =>
    new CliError(
      ErrorCode.SyncConflict,
      `${what} conflicts with newer commits on origin/${base}; nothing was pushed and brains/${id}/ is as it was. ` +
        `Bring it up to date in brains/${id}/ with git stash -u, ${update}, git stash pop; resolve the conflicts there, then commit again`,
    );

  try {
    await gitOk(dir, ['switch', '-q', '--no-track', '-c', branch, `origin/${base}`]);
    for (const c of localCommits) {
      if ((await git(dir, ['cherry-pick', c])).exitCode !== 0) return await fail(conflict(`your local commit ${c.slice(0, 7)}`));
    }
    if (stashed && (await git(dir, ['stash', 'apply', '-q'])).exitCode !== 0) return await fail(conflict('your change'));
    warnings.push(...(await fixGenerated(await loadWorkspace(root), id)).warnings);
    await assertGate(root, id);
    await gitOk(dir, ['add', '-A']);
    if ((await git(dir, ['diff', '--cached', '--quiet'])).exitCode === 0 && localCommits.length === 0) {
      return await fail(new CliError(ErrorCode.Git, `the changes in brains/${id}/ are already on origin/${base}; nothing to contribute`));
    }
    const commit = await git(dir, ['commit', '-q', '--allow-empty', '-m', o.message]);
    if (commit.exitCode !== 0) return await fail(new CliError(ErrorCode.Git, `git commit failed in brains/${id}/: ${firstLine(commit.stderr)}`));
    const push = await git(dir, ['push', '-q', '-u', 'origin', branch], { network: true });
    if (push.exitCode !== 0) {
      return await fail(new CliError(ErrorCode.Git, `the push of ${branch} to ${o.url} failed: ${firstLine(push.stderr)}`), `. Your changes are back, uncommitted, in brains/${id}/`);
    }
  } catch (err) {
    if (restored) throw err;
    const e = err instanceof CliError ? err : new CliError(ErrorCode.Git, err instanceof Error ? firstLine(err.message) : String(err));
    return fail(e, `. Nothing was pushed, and your changes are back in brains/${id}/`);
  }

  // Pushed: the branch holds every change, so the stash and the local-only commits can go.
  if (stashed) await git(dir, ['stash', 'drop', '-q']);
  const text = prText(o.message, o.body);
  let pr: { number: number; url: string };
  let sha: string;
  let changed: string[];
  try {
    sha = await gitOk(dir, ['rev-parse', 'HEAD']);
    changed = (await gitOk(dir, ['diff', '--name-only', '-z', `origin/${base}`, 'HEAD'])).split('\0').filter((f) => f !== '').sort();
    pr = await host.createPullRequest({ repo, head: branch, base, title: text.title, body: text.body });
  } catch (err) {
    await git(dir, ['switch', '-q', base]);
    const why = err instanceof Error ? firstLine(err.message) : String(err);
    const code = err instanceof CliError ? err.code : ErrorCode.PrCreate;
    throw new CliError(
      code,
      `${why}; your changes are on the branch ${branch}, which is pushed, so open the pull request at https://github.com/${repo.owner}/${repo.name}/compare/${base}...${branch}`,
    );
  }
  await gitOk(dir, ['switch', '-q', base]);
  await gitOk(dir, ['reset', '-q', '--hard', `origin/${base}`]);
  await git(dir, ['branch', '-q', '-D', branch]);
  return { ...result, committed: true, commit: sha, files: changed, pushed: true, branch, pr, warnings };
}
