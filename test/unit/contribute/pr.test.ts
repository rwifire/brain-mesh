import { chmod, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commandsFor } from '../../../src/commands/index.js';
import { CliError } from '../../../src/output.js';
import { run } from '../../helpers/cli.js';
import { tempDir, writeTree } from '../../helpers/fixtures.js';
import { isolateGit } from '../../helpers/git-env.js';
import { fakeHost } from '../../helpers/host.js';
import { githubAlias, initWorkspace, pushToRemote, sharedBrainFiles, sharedRemote } from '../../helpers/remotes.js';
import { git } from '../../helpers/workspace.js';

const GH = 'https://github.com/acme/brain-sre.git';
const note = (title: string) => `---\ntype: note\nsummary: ${title} in one sentence.\nupdated: 2026-11-27\n---\n# ${title}\n\nText.\n`;
const BRANCH = 'mesh/octo-user/add-runner-pools';

/** A workspace with `brain-sre` mounted to contribute through a github.com URL aliased to a local bare repo. */
async function setup(o: { files?: Record<string, string>; defaultBranch?: string; host?: ReturnType<typeof fakeHost> } = {}) {
  const base = await tempDir('bm pr ');
  await isolateGit({ extra: githubAlias(base) });
  const ws = await initWorkspace(base);
  const bare = await sharedRemote(base, 'brain-sre', o.files);
  if (o.defaultBranch !== undefined) {
    await git(bare, 'branch', '-m', 'main', o.defaultBranch);
    await git(bare, 'symbolic-ref', 'HEAD', `refs/heads/${o.defaultBranch}`);
  }
  const host = o.host ?? fakeHost();
  const commands = commandsFor(host);
  const m = await run(['mount', GH, '--mode', 'contribute', '--json'], ws.root, commands);
  if (m.code !== 0) throw new Error(m.out);
  const dir = join(ws.root, 'brains', 'brain-sre');
  return { ...ws, bare, dir, host, commands };
}
async function addNote(root: string, dir: string, rel = 'notes/runner-pools.md', title = 'Runner pools') {
  await writeTree(dir, { [rel]: note(title) });
  const d = await run(['doctor', 'brain-sre', '--fix', '--json'], root);
  if (d.json().data.counts.errors !== 0) throw new Error(d.out);
}
const commit = (root: string, commands: ReturnType<typeof commandsFor>, ...args: string[]) => run(['commit', 'brain-sre', ...args, '--json'], root, commands);
const status = (dir: string) => git(dir, 'status', '--porcelain', '--untracked-files=all');
const remoteBranches = async (bare: string) => (await git(bare, 'branch', '--format=%(refname:short)')).trim().split('\n').filter((b) => b !== '');
const localMesh = async (dir: string) => (await git(dir, 'branch', '--list', 'mesh/*')).trim();
/** Everything a failed contribute must leave as it was. */
const snapshot = async (dir: string) => ({
  branch: (await git(dir, 'branch', '--show-current')).trim(),
  head: (await git(dir, 'rev-parse', 'HEAD')).trim(),
  status: await status(dir),
  stash: (await git(dir, 'stash', 'list')).trim(),
  mesh: await localMesh(dir),
});

describe('the pull-request route', () => {
  it('opens a PR', async () => {
    const { root, bare, dir, host, commands } = await setup();
    await addNote(root, dir);
    const r = await commit(root, commands, '-m', 'Add runner pools', '--body', 'Why: the pools note was missing.');
    expect(r.code, r.out).toBe(0);
    expect(r.json().data).toMatchObject({ brain: 'brain-sre', route: 'pr', committed: true, pushed: true, branch: BRANCH, pr: { number: 1, url: 'https://github.com/acme/brain-sre/pull/1' }, dryRun: false });
    expect(r.json().data.files).toContain('notes/runner-pools.md');
    expect(await remoteBranches(bare)).toContain(BRANCH);
    expect((await git(bare, 'log', '--format=%s', `main..${BRANCH}`)).trim()).toBe('Add runner pools');
    expect(host.prs).toEqual([{ repo: { owner: 'acme', name: 'brain-sre' }, head: BRANCH, base: 'main', title: 'Add runner pools', body: 'Why: the pools note was missing.' }]);
    expect((await git(dir, 'branch', '--show-current')).trim()).toBe('main');
    expect((await git(dir, 'rev-parse', 'main')).trim()).toBe((await git(dir, 'rev-parse', 'origin/main')).trim());
    expect((await status(dir)).trim()).toBe('');
    expect(await localMesh(dir)).toBe('');
  });

  it('the body defaults to the rest of the message', async () => {
    const { root, dir, host, commands } = await setup();
    await addNote(root, dir);
    expect((await commit(root, commands, '-m', 'Add runner pools\n\nThe pools note was missing.')).code).toBe(0);
    expect(host.prs[0]).toMatchObject({ title: 'Add runner pools', body: 'The pools note was missing.' });
  });

  it("branch names don't collide", async () => {
    const { root, bare, dir, commands } = await setup();
    await git(bare, 'branch', BRANCH, 'main');
    await addNote(root, dir);
    const r = await commit(root, commands, '-m', 'Add runner pools');
    expect(r.json().data.branch, r.out).toBe(`${BRANCH}-2`);
  });

  it('behind and ahead', async () => {
    const { root, bare, dir, commands } = await setup();
    await pushToRemote(bare, 'notes/other.md', note('Other'));
    await addNote(root, dir, 'notes/local.md', 'Local');
    await git(dir, 'add', '-A');
    await git(dir, 'commit', '-q', '-m', 'local commit');
    await addNote(root, dir);
    const r = await commit(root, commands, '-m', 'Add runner pools');
    expect(r.code, r.out).toBe(0);
    const tree = (await git(bare, 'ls-tree', '-r', '--name-only', BRANCH)).split('\n');
    expect(tree).toEqual(expect.arrayContaining(['notes/other.md', 'notes/local.md', 'notes/runner-pools.md']));
    const readme = await git(bare, 'show', `${BRANCH}:notes/README.md`);
    for (const n of ['other.md', 'local.md', 'runner-pools.md']) expect(readme, n).toContain(n);
    expect((await git(dir, 'rev-parse', 'main')).trim()).toBe((await git(dir, 'rev-parse', 'origin/main')).trim());
    expect((await status(dir)).trim()).toBe('');
  });

  it('deletions travel', async () => {
    const files = { ...sharedBrainFiles('brain-sre'), 'notes/old.md': note('Old') };
    const { root, bare, dir, commands } = await setup({ files });
    await run(['doctor', 'brain-sre', '--fix', '--json'], root);
    await git(dir, 'add', '-A');
    await git(dir, 'commit', '-q', '-m', 'regenerate');
    await git(dir, 'push', '-q');
    await rm(join(dir, 'notes', 'old.md'));
    await run(['doctor', 'brain-sre', '--fix', '--json'], root);
    const r = await commit(root, commands, '-m', 'Remove old note');
    expect(r.code, r.out).toBe(0);
    expect(r.json().data.files).toContain('notes/old.md');
    expect(await git(bare, 'show', '--name-status', '--format=', 'mesh/octo-user/remove-old-note')).toContain('D\tnotes/old.md');
  });

  it('non-main default', async () => {
    const { root, dir, host, commands } = await setup({ defaultBranch: 'trunk' });
    await addNote(root, dir);
    const r = await commit(root, commands, '-m', 'Add runner pools');
    expect(r.code, r.out).toBe(0);
    expect(host.prs[0]?.base).toBe('trunk');
    expect((await git(dir, 'branch', '--show-current')).trim()).toBe('trunk');
  });

  it('refuses before anything changes', async () => {
    const base = await tempDir('bm pr local ');
    await isolateGit();
    const ws = await initWorkspace(base);
    const local = await sharedRemote(base, 'brain-sre');
    expect((await run(['mount', local, '--mode', 'contribute', '--json'], ws.root)).code).toBe(0);
    const localDir = join(ws.root, 'brains', 'brain-sre');
    await addNote(ws.root, localDir);
    const localBefore = await status(localDir);
    expect((await run(['commit', 'brain-sre', '-m', 'x', '--json'], ws.root)).json().error.code).toBe('E_NOT_SUPPORTED');
    expect(await status(localDir)).toBe(localBefore);

    const { root, bare, dir } = await setup();
    await addNote(root, dir);
    const before = await status(dir);
    const readOnly = commandsFor(fakeHost({ permissions: { 'acme/brain-sre': 'read' } }));
    expect((await commit(root, readOnly, '-m', 'Add runner pools')).json().error.code).toBe('E_NO_PUSH_RIGHTS');
    expect(await status(dir)).toBe(before);
    await git(dir, 'switch', '-q', '-c', 'x');
    const onX = await commit(root, commandsFor(fakeHost()), '-m', 'Add runner pools');
    expect(onX.json().error).toMatchObject({ code: 'E_GIT', message: expect.stringContaining('main') });
    expect(await status(dir)).toBe(before);
    expect(await remoteBranches(bare)).toEqual(['main']);
  });

  it('push fails', async () => {
    const { root, bare, dir, commands } = await setup();
    const hook = join(bare, 'hooks', 'pre-receive');
    await writeFile(hook, '#!/bin/sh\necho "rejected by test" >&2\nexit 1\n', 'utf8');
    await chmod(hook, 0o755);
    await addNote(root, dir);
    const before = await status(dir);
    const head = (await git(dir, 'rev-parse', 'HEAD')).trim();
    const r = await commit(root, commands, '-m', 'Add runner pools');
    expect(r.json().error.code, r.out).toBe('E_GIT');
    expect((await git(dir, 'branch', '--show-current')).trim()).toBe('main');
    expect((await git(dir, 'rev-parse', 'HEAD')).trim()).toBe(head);
    expect(await status(dir)).toBe(before);
    expect(await localMesh(dir)).toBe('');
  });

  it('PR fails', async () => {
    const host = fakeHost({ prError: new CliError('E_PR_CREATE', 'boom') });
    const { root, bare, dir, commands } = await setup({ host });
    await addNote(root, dir);
    const r = await commit(root, commands, '-m', 'Add runner pools');
    expect(r.json().error).toMatchObject({ code: 'E_PR_CREATE', message: expect.stringContaining(`https://github.com/acme/brain-sre/compare/main...${BRANCH}`) });
    expect(await remoteBranches(bare)).toContain(BRANCH);
    expect((await git(dir, 'branch', '--show-current')).trim()).toBe('main');
  });

  it('dry run, PR route', async () => {
    const host = fakeHost();
    const { root, dir, commands } = await setup({ host });
    await addNote(root, dir);
    const before = await status(dir);
    const callsBefore = host.calls.length;
    const r = await commit(root, commands, '--dry-run', '-m', 'Add runner pools');
    expect(r.code, r.out).toBe(0);
    expect(r.json().data).toMatchObject({ route: 'pr', dryRun: true, committed: false, branch: BRANCH, pr: null });
    expect(r.json().data.files).toContain('notes/runner-pools.md');
    expect(host.calls.length).toBe(callsBefore);
    expect(await status(dir)).toBe(before);
  });
});

describe('contribute restores the clone on every failure', () => {
  it('a branch that cannot be created', async () => {
    const { root, dir, commands } = await setup();
    await git(dir, 'branch', 'mesh/octo-user', 'main');
    await addNote(root, dir);
    const before = await snapshot(dir);
    const r = await commit(root, commands, '-m', 'Add runner pools');
    expect(r.code, r.out).not.toBe(0);
    expect(await snapshot(dir)).toEqual(before);
  });

  it('a stash that cannot be popped is named', async () => {
    const { root, bare, dir, commands } = await setup();
    const lock = join(dir, '.git', 'index.lock').replace(/\\/g, '/');
    const hook = join(bare, 'hooks', 'pre-receive');
    await writeFile(hook, `#!/bin/sh\ntouch "${lock}"\nexit 1\n`, 'utf8');
    await chmod(hook, 0o755);
    await addNote(root, dir);
    const r = await commit(root, commands, '-m', 'Add runner pools');
    expect(r.json().error.message, r.out).toContain('git stash');
    expect(r.json().error.message).not.toContain('Your changes are back');
    await rm(lock);
    expect(await git(dir, 'stash', 'list')).toContain('brain-mesh contribute');
  });

  it('an uncommitted change that conflicts with origin', async () => {
    const { root, bare, dir, commands } = await setup();
    await pushToRemote(bare, 'notes/runner-pools.md', note('Upstream pools'));
    await addNote(root, dir);
    const before = await snapshot(dir);
    const r = await commit(root, commands, '-m', 'Add runner pools');
    expect(r.json().error, r.out).toMatchObject({ code: 'E_SYNC_CONFLICT', message: expect.stringContaining('git merge --ff-only origin/main') });
    expect(await snapshot(dir)).toEqual(before);
  });

  it('a local commit that conflicts with origin', async () => {
    const { root, bare, dir, commands } = await setup();
    await pushToRemote(bare, 'notes/runner-pools.md', note('Upstream pools'));
    await addNote(root, dir);
    await git(dir, 'add', '-A');
    await git(dir, 'commit', '-q', '-m', 'local commit');
    await addNote(root, dir, 'notes/other.md', 'Other');
    const before = await snapshot(dir);
    const r = await commit(root, commands, '-m', 'Add runner pools');
    expect(r.json().error.code, r.out).toBe('E_SYNC_CONFLICT');
    expect(await snapshot(dir)).toEqual(before);
  });

  it('a gate failure on the fresh base', async () => {
    const { root, bare, dir, commands } = await setup();
    await pushToRemote(bare, 'notes/broken.md', '---\ntype: note\nupdated: 2026-11-27\n---\n# Broken\n');
    await addNote(root, dir);
    const before = await snapshot(dir);
    const r = await commit(root, commands, '-m', 'Add runner pools');
    expect(r.json().error.code, r.out).toBe('E_DOCTOR_ERRORS');
    expect(await snapshot(dir)).toEqual(before);
  });
});
