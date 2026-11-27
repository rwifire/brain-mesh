import { join } from 'node:path';
import type { CommitData } from '../commands/commit.js';
import { fixGenerated } from '../doctor/fix.js';
import { git, gitOk } from '../git.js';
import type { Host } from '../host/host.js';
import { checkPushRights } from '../mount/rights.js';
import { CliError, ErrorCode, type Warning } from '../output.js';
import { loadWorkspace } from '../workspace/load.js';
import { assertGate, brainChanges } from './gate.js';
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
  if (files.length === 0) return { ...result, warnings };

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
  const localCommits = (await gitOk(dir, ['rev-list', '--reverse', `origin/${base}..HEAD`])).split('\n').filter((c) => c !== '');

  // From here on the clone changes; `restore` puts it back exactly as it was.
  await gitOk(dir, ['stash', 'push', '-q', '-u', '-m', STASH_MESSAGE]);
  const restore = async () => {
    await git(dir, ['cherry-pick', '--abort']);
    await git(dir, ['reset', '-q', '--hard']);
    await git(dir, ['clean', '-q', '-fd']);
    await git(dir, ['switch', '-q', '-f', base]);
    await git(dir, ['branch', '-q', '-D', branch]);
    const pop = await git(dir, ['stash', 'pop', '-q']);
    if (pop.exitCode !== 0) {
      warnings.push({ code: 'W_STASH_KEPT', message: `your changes in brains/${id}/ are kept in git stash (${STASH_MESSAGE}): ${firstLine(pop.stderr)}` });
    }
  };
  const fail = async (err: CliError): Promise<never> => {
    await restore();
    throw err;
  };
  const conflict = (what: string) =>
    new CliError(ErrorCode.SyncConflict, `${what} conflicts with newer commits on origin/${base}; nothing was pushed and brains/${id}/ is as it was. Merge origin/${base} by hand, then commit again`);

  await gitOk(dir, ['switch', '-q', '--no-track', '-c', branch, `origin/${base}`]);
  for (const c of localCommits) {
    if ((await git(dir, ['cherry-pick', c])).exitCode !== 0) return fail(conflict(`your local commit ${c.slice(0, 7)}`));
  }
  if ((await git(dir, ['stash', 'apply', '-q'])).exitCode !== 0) return fail(conflict('your change'));
  try {
    warnings.push(...(await fixGenerated(await loadWorkspace(root), id)).warnings);
    await assertGate(root, id);
  } catch (err) {
    if (err instanceof CliError) return fail(err);
    await restore();
    throw err;
  }
  await gitOk(dir, ['add', '-A']);
  if ((await git(dir, ['diff', '--cached', '--quiet'])).exitCode === 0 && localCommits.length === 0) {
    return fail(new CliError(ErrorCode.Git, `the changes in brains/${id}/ are already on origin/${base}; nothing to contribute`));
  }
  const commit = await git(dir, ['commit', '-q', '--allow-empty', '-m', o.message]);
  if (commit.exitCode !== 0) return fail(new CliError(ErrorCode.Git, `git commit failed in brains/${id}/: ${firstLine(commit.stderr)}`));
  const push = await git(dir, ['push', '-q', '-u', 'origin', branch], { network: true });
  if (push.exitCode !== 0) {
    return fail(new CliError(ErrorCode.Git, `the push of ${branch} to ${o.url} failed: ${firstLine(push.stderr)}. Your changes are back, uncommitted, in brains/${id}/`));
  }

  // Pushed: the branch holds every change, so the stash and the local-only commits can go.
  await git(dir, ['stash', 'drop', '-q']);
  const sha = await gitOk(dir, ['rev-parse', 'HEAD']);
  const changed = (await gitOk(dir, ['diff', '--name-only', '-z', `origin/${base}`, 'HEAD'])).split('\0').filter((f) => f !== '').sort();
  const text = prText(o.message, o.body);
  let pr: { number: number; url: string };
  try {
    pr = await host.createPullRequest({ repo, head: branch, base, title: text.title, body: text.body });
  } catch (err) {
    await git(dir, ['switch', '-q', base]);
    const why = err instanceof Error ? firstLine(err.message) : String(err);
    const code = err instanceof CliError ? err.code : ErrorCode.PrCreate;
    throw new CliError(
      code,
      `${why}; the branch ${branch} is pushed, so open the pull request at https://github.com/${repo.owner}/${repo.name}/compare/${base}...${branch}`,
    );
  }
  await gitOk(dir, ['switch', '-q', base]);
  await gitOk(dir, ['reset', '-q', '--hard', `origin/${base}`]);
  await git(dir, ['branch', '-q', '-D', branch]);
  return { ...result, committed: true, commit: sha, files: changed, pushed: true, branch, pr, warnings };
}
